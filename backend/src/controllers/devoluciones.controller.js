import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { MOTIVOS_DEVOLUCION, MEDIOS_DEVOLUCION, esEnumValido } from '../utils/enums.js'
import { sincronizarStockIngrediente } from '../utils/inventario.js'

export const crearDevolucion = asyncHandler(async (req, res) => {
  const { ventaId, monto, motivo, regresaAInventario = false, medioDevolucion, ventaProductoIds } = req.body
  if (!ventaId) throw new HttpError(400, 'ventaId es obligatorio')
  if (typeof monto !== 'number' || monto < 0) {
    throw new HttpError(400, 'monto debe ser un número mayor o igual a 0')
  }
  if (!esEnumValido(motivo, MOTIVOS_DEVOLUCION)) {
    throw new HttpError(400, 'motivo inválido (Producto_mal_estado, Pedido_incorrecto, Cliente_insatisfecho u Otro)')
  }
  if (!esEnumValido(medioDevolucion, MEDIOS_DEVOLUCION)) {
    throw new HttpError(400, 'medioDevolucion inválido (Efectivo, Tarjeta, Transferencia o Efectivo_de_caja)')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    // La Venta original NO se modifica ni se borra (se mantiene para trazabilidad).
    const venta = await tx.venta.findUnique({ where: { id: Number(ventaId) } })
    if (!venta) throw new HttpError(404, 'La venta indicada no existe')

    // Límite (docs): la suma de devoluciones de una venta no puede EXCEDER el
    // monto que el cliente pagó. Esto bloquea devoluciones duplicadas (doble
    // clic o reintento) y devoluciones parciales que sobrepasen lo vendido.
    const devolucionesPrevias = await tx.devolucion.aggregate({
      _sum: { monto: true },
      where: { ventaId: venta.id },
    })
    const montoYaDevuelto = devolucionesPrevias._sum.monto ?? 0
    if (montoYaDevuelto + monto > venta.total) {
      throw new HttpError(
        400,
        `La devolución excede el monto pagado de la venta (ya se devolvieron ${montoYaDevuelto} de ${venta.total})`
      )
    }

    // Devolución PARCIAL: valida que los Venta_Producto pertenezcan a la venta
    // y que ninguno ya haya sido devuelto (evita registrar el mismo producto
    // dos veces, aunque no regrese a inventario).
    let idsProductos = null
    if (Array.isArray(ventaProductoIds) && ventaProductoIds.length > 0) {
      idsProductos = [...new Set(ventaProductoIds.map(Number))]
      const ventaProductos = await tx.venta_Producto.findMany({
        where: { id: { in: idsProductos }, ventaId: venta.id },
        select: { id: true },
      })
      if (ventaProductos.length !== idsProductos.length) {
        throw new HttpError(400, 'Alguno de los ventaProductoIds no pertenece a la venta indicada')
      }
      const yaDevueltos = await tx.movimiento_Inventario.count({
        where: { ventaProductoId: { in: idsProductos }, tipoMovimiento: 'Devolucion_regreso' },
      })
      if (yaDevueltos > 0) {
        throw new HttpError(
          400,
          'Alguno de los productos seleccionados ya fue devuelto previamente (devolución duplicada)'
        )
      }
    }

    // Se asocia al Dia_Operativo Abierto actual; si no hay ninguno, queda null
    // y se asocia al siguiente que se abra (mismo patrón que Gasto).
    const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })

    const devolucion = await tx.devolucion.create({
      data: {
        ventaId: venta.id,
        monto,
        motivo,
        medioPagoOriginal: venta.metodoPago,
        medioDevolucion,
        regresaAInventario: regresaAInventario === true,
        diaOperativoId: dia?.id ?? null,
      },
    })

    // Si regresa_a_inventario = true, suma de vuelta el stock.
    let regresos = 0
    if (regresaAInventario === true) {
      if (idsProductos != null) {
        // Devolución PARCIAL: solo regresan las Salida_venta EXACTAS de los
        // Venta_Producto indicados (modificadores, mitad y mitad, combos y
        // "usar disponible" ya aplicados en el momento de la venta) — no se
        // recalcula con la receta actual (evita el drift).
        const salidas = await tx.movimiento_Inventario.findMany({
          where: { ventaProductoId: { in: idsProductos }, tipoMovimiento: 'Salida_venta' },
        })
        for (const mv of salidas) {
          await tx.movimiento_Inventario.create({
            data: {
              ...(mv.ingredienteId != null
                ? { ingredienteId: mv.ingredienteId }
                : { productoId: mv.productoId }),
              tipoMovimiento: 'Devolucion_regreso',
              cantidad: -mv.cantidad,
              referenciaId: devolucion.id,
              referenciaTipo: 'Devolucion',
              ...(mv.ventaProductoId != null ? { ventaProductoId: mv.ventaProductoId } : {}),
            },
          })
          regresos++
          if (mv.ingredienteId != null) {
            await sincronizarStockIngrediente(tx, mv.ingredienteId)
          }
        }
      } else {
        // Devolución COMPLETA: regresa todo el stock que descontó la venta (se
        // recupera de los Movimiento_Inventario Salida_venta asociados, que ya
        // reflejan modificadores, mitad y mitad, y "usar disponible").
        const salidas = await tx.movimiento_Inventario.findMany({
          where: { referenciaId: venta.id, referenciaTipo: 'Venta', tipoMovimiento: 'Salida_venta' },
        })
        for (const mv of salidas) {
          await tx.movimiento_Inventario.create({
            data: {
              ...(mv.ingredienteId != null
                ? { ingredienteId: mv.ingredienteId }
                : { productoId: mv.productoId }),
              tipoMovimiento: 'Devolucion_regreso',
              cantidad: -mv.cantidad,
              referenciaId: devolucion.id,
              referenciaTipo: 'Devolucion',
              ...(mv.ventaProductoId != null ? { ventaProductoId: mv.ventaProductoId } : {}),
            },
          })
          regresos++
          if (mv.ingredienteId != null) {
            await sincronizarStockIngrediente(tx, mv.ingredienteId)
          }
        }
      }
    }

    return {
      devolucion: await tx.devolucion.findUnique({
        where: { id: devolucion.id },
        include: {
          venta: { include: { productos: { include: { producto: { select: { id: true, nombre: true } } } } } },
        },
      }),
      regresos,
      asociadaASiguienteDia: dia ? false : true,
    }
  })

  res.status(201).json({
    mensaje: 'Devolución registrada',
    devolucion: resultado.devolucion,
    movimientosRegreso: resultado.regresos,
    asociadaASiguienteDia: resultado.asociadaASiguienteDia,
  })
})

export const listarDevoluciones = asyncHandler(async (_req, res) => {
  const devoluciones = await prisma.devolucion.findMany({
    orderBy: { fechaHora: 'desc' },
    include: {
      venta: {
        include: {
          productos: {
            include: {
              producto: { select: { id: true, nombre: true } },
              mitadYMitad: true,
              modificadores: true,
            },
          },
        },
      },
      diaOperativo: { select: { id: true, estado: true } },
    },
  })

  // Reporte: producto, costo, medio de pago original, medio de devolución.
  res.json(
    devoluciones.map((d) => ({
      id: d.id,
      fechaHora: d.fechaHora,
      monto: d.monto,
      motivo: d.motivo,
      medioPagoOriginal: d.medioPagoOriginal,
      medioDevolucion: d.medioDevolucion,
      regresaAInventario: d.regresaAInventario,
      ventaId: d.ventaId,
      diaOperativoId: d.diaOperativoId,
      productos: d.venta.productos.map((vp) => ({
        producto: vp.producto?.nombre ?? null,
        costo: vp.precioCongelado,
        cantidad: vp.cantidad,
      })),
    }))
  )
})