import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { MOTIVOS_AJUSTE, esEnumValido } from '../utils/enums.js'
import {
  stockIngrediente,
  stockProducto,
  sincronizarStockIngrediente,
} from '../utils/inventario.js'

// Resuelve la cuenta destino del movimiento: ingrediente o producto
// (Reventa_directa usa su propio movimiento por productoId).
async function resolverCuenta(tx, body) {
  const { ingredienteId, productoId } = body
  if (ingredienteId != null && productoId != null) {
    throw new HttpError(400, 'Indica solo ingredienteId o solo productoId, no ambos')
  }
  if (ingredienteId != null) {
    const ingrediente = await tx.ingrediente.findUnique({ where: { id: Number(ingredienteId) } })
    if (!ingrediente) throw new HttpError(404, 'El ingrediente indicado no existe')
    return { tipo: 'ingrediente', id: ingrediente.id, nombre: ingrediente.nombre }
  }
  if (productoId != null) {
    const producto = await tx.producto.findUnique({ where: { id: Number(productoId) } })
    if (!producto) throw new HttpError(404, 'El producto indicado no existe')
    if (producto.tipo !== 'Reventa_directa') {
      throw new HttpError(400, 'Solo los productos de tipo Reventa_directa llevan stock propio (los de receta usan sus ingredientes)')
    }
    return { tipo: 'producto', id: producto.id, nombre: producto.nombre }
  }
  throw new HttpError(400, 'Indica ingredienteId o productoId')
}

export const registrarEntrada = asyncHandler(async (req, res) => {
  const { cantidad, costo } = req.body
  if (typeof cantidad !== 'number' || cantidad <= 0) {
    throw new HttpError(400, 'cantidad debe ser un número mayor a 0')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const cuenta = await resolverCuenta(tx, req.body)

    const movimiento = await tx.movimiento_Inventario.create({
      data: {
        ...(cuenta.tipo === 'ingrediente'
          ? { ingredienteId: cuenta.id }
          : { productoId: cuenta.id }),
        tipoMovimiento: 'Entrada',
        cantidad,
      },
    })

    if (cuenta.tipo === 'ingrediente') {
      await sincronizarStockIngrediente(tx, cuenta.id)
    }

    // Entrada con costo -> genera un Gasto automático de la categoría Insumos
    // (docs/04 "Registro de entrada de inventario"). El Gasto se asocia luego
    // al Dia_Operativo que corresponda por el Módulo 05 (caja y gastos).
    let gasto = null
    if (costo != null) {
      if (typeof costo !== 'number' || costo < 0) {
        throw new HttpError(400, 'costo debe ser un número mayor o igual a 0')
      }
      const usuarioId = resolverUsuario(req)
      // Se asocia al Dia_Operativo Abierto actual; si no hay ninguno, queda
      // null y se asocia al siguiente que se abra (mismo patrón que Gasto).
      const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
      gasto = await tx.gasto.create({
        data: {
          concepto: `Entrada de inventario: ${cuenta.nombre}`,
          monto: costo,
          categoria: 'Insumos',
          metodoPago: 'Efectivo',
          origen: 'Automatico_por_entrada_inventario',
          diaOperativoId: dia?.id ?? null,
          usuarioId,
        },
      })
    }

    return { movimiento, gasto, cuenta }
  })

  res.status(201).json({
    mensaje: 'Entrada de inventario registrada',
    movimiento: resultado.movimiento,
    stockActual: resultado.cuenta.tipo === 'ingrediente'
      ? await stockIngrediente(prisma, resultado.cuenta.id)
      : await stockProducto(prisma, resultado.cuenta.id),
    ...(resultado.gasto ? { gasto: resultado.gasto } : {}),
  })
})

export const registrarAjuste = asyncHandler(async (req, res) => {
  const { stockRealContado, motivo } = req.body
  if (typeof stockRealContado !== 'number') {
    throw new HttpError(400, 'stockRealContado debe ser numérico')
  }
  if (!esEnumValido(motivo, MOTIVOS_AJUSTE)) {
    throw new HttpError(400, 'motivo inválido (Conteo_fisico, Merma u Otro)')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const cuenta = await resolverCuenta(tx, req.body)

    const stockActual = await (cuenta.tipo === 'ingrediente'
      ? stockIngrediente(tx, cuenta.id)
      : stockProducto(tx, cuenta.id))

    const diferencia = stockRealContado - stockActual
    if (diferencia === 0) {
      return { sinDiferencia: true, cuenta, stockActual }
    }

    const movimiento = await tx.movimiento_Inventario.create({
      data: {
        ...(cuenta.tipo === 'ingrediente'
          ? { ingredienteId: cuenta.id }
          : { productoId: cuenta.id }),
        tipoMovimiento: 'Ajuste',
        cantidad: diferencia,
        motivo,
      },
    })

    if (cuenta.tipo === 'ingrediente') {
      await sincronizarStockIngrediente(tx, cuenta.id)
    }

    return { sinDiferencia: false, movimiento, cuenta, stockRealContado }
  })

  if (resultado.sinDiferencia) {
    return res.json({
      mensaje: 'No hay diferencia: el stock contado coincide con el stock actual',
      stockActual: resultado.stockActual,
    })
  }

  res.json({
    mensaje: 'Ajuste de inventario registrado',
    movimiento: resultado.movimiento,
    stockAnterior: resultado.stockRealContado - resultado.movimiento.cantidad,
    stockActual: resultado.stockRealContado,
  })
})

export const consultarStock = asyncHandler(async (req, res) => {
  const { ingredienteId, productoId } = req.query

  if (ingredienteId != null) {
    const ingrediente = await prisma.ingrediente.findUnique({ where: { id: Number(ingredienteId) } })
    if (!ingrediente) throw new HttpError(404, 'El ingrediente indicado no existe')
    const stock = await stockIngrediente(prisma, ingrediente.id)
    return res.json({ tipo: 'ingrediente', id: ingrediente.id, nombre: ingrediente.nombre, unidadMedida: ingrediente.unidadMedida, stockActual: stock })
  }

  if (productoId != null) {
    const producto = await prisma.producto.findUnique({ where: { id: Number(productoId) } })
    if (!producto) throw new HttpError(404, 'El producto indicado no existe')
    const stock = await stockProducto(prisma, producto.id)
    return res.json({ tipo: 'producto', id: producto.id, nombre: producto.nombre, stockActual: stock })
  }

  // Listado completo: stock calculado SIEMPRE desde los movimientos.
  const [ingredientes, agrupadoIngredientes, productosReventa, agrupadoProductos] = await Promise.all([
    prisma.ingrediente.findMany({ orderBy: { nombre: 'asc' } }),
    prisma.movimiento_Inventario.groupBy({
      by: ['ingredienteId'],
      where: { ingredienteId: { not: null } },
      _sum: { cantidad: true },
    }),
    prisma.producto.findMany({ where: { tipo: 'Reventa_directa' }, orderBy: { nombre: 'asc' } }),
    prisma.movimiento_Inventario.groupBy({
      by: ['productoId'],
      where: { productoId: { not: null } },
      _sum: { cantidad: true },
    }),
  ])

  const stockIngredientes = new Map(
    agrupadoIngredientes.map((g) => [g.ingredienteId, g._sum.cantidad ?? 0])
  )
  const stockProductos = new Map(
    agrupadoProductos.map((g) => [g.productoId, g._sum.cantidad ?? 0])
  )

  res.json({
    ingredientes: ingredientes.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      unidadMedida: i.unidadMedida,
      stockActual: stockIngredientes.get(i.id) ?? 0,
      estado: i.estado,
    })),
    productos: productosReventa.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      stockActual: stockProductos.get(p.id) ?? 0,
      estado: p.estado,
    })),
  })
})