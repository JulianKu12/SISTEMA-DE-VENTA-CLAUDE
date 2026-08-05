import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { ejecutarVenta } from './ventas.controller.js'

export const abrirCaja = asyncHandler(async (req, res) => {
  const { fondoInicial, ventasPrevias } = req.body
  if (typeof fondoInicial !== 'number' || fondoInicial < 0) {
    throw new HttpError(400, 'fondoInicial debe ser un número mayor o igual a 0')
  }
  if (ventasPrevias !== undefined && !Array.isArray(ventasPrevias)) {
    throw new HttpError(400, 'ventasPrevias debe ser una lista de ventas')
  }

  const usuarioId = await resolverUsuario(prisma, req.body)

  const resultado = await prisma.$transaction(async (tx) => {
    // No puede haber 2 Dia_Operativo en estado Abierto al mismo tiempo.
    const existente = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
    if (existente) {
      throw new HttpError(409, 'Ya existe una caja abierta (Dia_Operativo en estado Abierto). Ciérrala antes de abrir otra.')
    }

    const dia = await tx.dia_Operativo.create({
      data: { fondoInicial, estado: 'Abierto', usuarioId },
    })

    // Gasto y Devolucion con dia_operativo_id = null (registrados sin caja
    // abierta) se asocian al nuevo Dia_Operativo (docs/05 "si no hay caja
    // abierta...").
    const gastosAsociados = await tx.gasto.updateMany({
      where: { diaOperativoId: null },
      data: { diaOperativoId: dia.id },
    })
    const devolucionesAsociadas = await tx.devolucion.updateMany({
      where: { diaOperativoId: null },
      data: { diaOperativoId: dia.id },
    })

    // Ventas previas a apertura: mismo flujo que una venta normal pero con
    // es_venta_previa_apertura = true (afectan inventario, no el corte de caja).
    const ventas = []
    if (ventasPrevias && ventasPrevias.length > 0) {
      for (const v of ventasPrevias) {
        const r = await ejecutarVenta(tx, {
          productos: v.productos,
          metodoPago: v.metodoPago,
          noCobrar: v.noCobrar,
          esVentaPreviaApertura: true,
          pedidoId: v.pedidoId,
          usarDisponible: v.usarDisponible,
          usuarioId,
          diaOperativoId: dia.id,
        })
        if (r.conflicto) {
          throw new HttpError(409, `No se pudo registrar una venta previa a apertura: ${r.mensaje}`)
        }
        ventas.push(r.venta)
      }
    }

    return {
      dia: await tx.dia_Operativo.findUnique({ where: { id: dia.id } }),
      ventas,
      gastosAsociados: gastosAsociados.count,
      devolucionesAsociadas: devolucionesAsociadas.count,
    }
  })

  res.status(201).json({
    mensaje: 'Caja abierta correctamente',
    diaOperativo: resultado.dia,
    ventasPreviasRegistradas: resultado.ventas,
    gastosAsociados: resultado.gastosAsociados,
    devolucionesAsociadas: resultado.devolucionesAsociadas,
  })
})

export const cerrarCaja = asyncHandler(async (req, res) => {
  const { efectivoContado } = req.body
  if (typeof efectivoContado !== 'number') {
    throw new HttpError(400, 'efectivoContado debe ser numérico')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
    if (!dia) throw new HttpError(409, 'No hay una caja abierta para cerrar')

    // Cálculo del efectivo esperado (docs/05):
    //   fondo_inicial + Venta(total Efectivo, no_cobrar=false)
    //   - Gasto(monto Efectivo) - Devolucion(monto Efectivo_de_caja)
    const [aggVentas, aggGastos, aggDevoluciones, aggTarjeta, aggTransferencia] = await Promise.all([
      tx.venta.aggregate({
        _sum: { total: true },
        where: {
          diaOperativoId: dia.id,
          metodoPago: 'Efectivo',
          noCobrar: false,
          esVentaPreviaApertura: false,
        },
      }),
      tx.gasto.aggregate({
        _sum: { monto: true },
        where: { diaOperativoId: dia.id, metodoPago: 'Efectivo' },
      }),
      tx.devolucion.aggregate({
        _sum: { monto: true },
        where: { diaOperativoId: dia.id, medioDevolucion: 'Efectivo_de_caja' },
      }),
      tx.venta.aggregate({
        _sum: { total: true },
        where: {
          diaOperativoId: dia.id,
          metodoPago: 'Tarjeta',
          noCobrar: false,
          esVentaPreviaApertura: false,
        },
      }),
      tx.venta.aggregate({
        _sum: { total: true },
        where: {
          diaOperativoId: dia.id,
          metodoPago: 'Transferencia',
          noCobrar: false,
          esVentaPreviaApertura: false,
        },
      }),
    ])

    const ventasEfectivo = aggVentas._sum.total ?? 0
    const gastosEfectivo = aggGastos._sum.monto ?? 0
    const devolucionesEfectivoCaja = aggDevoluciones._sum.monto ?? 0

    const efectivoEsperado = dia.fondoInicial + ventasEfectivo - gastosEfectivo - devolucionesEfectivoCaja
    const diferencia = efectivoContado - efectivoEsperado

    // Aviso al cerrar caja (docs/05 + docs/06): pedidos aún Pendiente_pago
    // sin resolver, y el monto informativo de pedidos Entregado que siguen
    // Pendiente_pago (repartidores aún en la calle).
    const [countPendientes, entregadosPendientes] = await Promise.all([
      tx.pedido.count({
        where: { estadoPago: 'Pendiente_pago', estadoPreparacion: { not: 'Cancelado' } },
      }),
      tx.pedido.aggregate({
        _sum: { total: true },
        where: { estadoPreparacion: 'Entregado', estadoPago: 'Pendiente_pago' },
      }),
    ])

    const cerrado = await tx.dia_Operativo.update({
      where: { id: dia.id },
      data: { estado: 'Cerrado', fechaCierre: new Date(), efectivoContado, diferencia },
    })

    return {
      dia: cerrado,
      efectivoEsperado,
      diferencia,
      ventasEfectivo,
      ventasTarjeta: aggTarjeta._sum.total ?? 0,
      ventasTransferencia: aggTransferencia._sum.total ?? 0,
      gastosEfectivo,
      devolucionesEfectivoCaja,
      pedidosPendientes: countPendientes,
      pedidosEntregadosPendientes: entregadosPendientes._sum.total ?? 0,
    }
  })

  res.json({
    mensaje: 'Caja cerrada correctamente',
    diaOperativo: resultado.dia,
    cierre: {
      efectivoEsperado: resultado.efectivoEsperado,
      efectivoContado,
      diferencia: resultado.diferencia,
    },
    ventas: {
      efectivo: resultado.ventasEfectivo,
      tarjeta: resultado.ventasTarjeta,
      transferencia: resultado.ventasTransferencia,
    },
    gastosEfectivo: resultado.gastosEfectivo,
    devolucionesEfectivoCaja: resultado.devolucionesEfectivoCaja,
    // Aviso informativo: pedidos sin resolver al momento de cerrar.
    pedidosPendientesPago: {
      cantidad: resultado.pedidosPendientes,
    },
    pedidosEntregadosPendientesPago: {
      cantidad: resultado.pedidosEntregadosPendientes > 0 ? undefined : 0,
      monto: resultado.pedidosEntregadosPendientes,
    },
  })
})

export const estadoCaja = asyncHandler(async (_req, res) => {
  const dia = await prisma.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
  if (!dia) return res.json({ abierta: false, dia: null })
  res.json({
    abierta: true,
    dia: {
      id: dia.id,
      fechaApertura: dia.fechaApertura,
      fondoInicial: dia.fondoInicial,
      estado: dia.estado,
      usuarioId: dia.usuarioId,
    },
  })
})

export const historialCaja = asyncHandler(async (_req, res) => {
  const dias = await prisma.dia_Operativo.findMany({
    where: { estado: 'Cerrado' },
    orderBy: { fechaApertura: 'desc' },
  })
  res.json(dias)
})