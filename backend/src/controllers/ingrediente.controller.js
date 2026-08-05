import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { UNIDADES_MEDIDA, esEnumValido } from '../utils/enums.js'

const OPCIONES_DESACTIVAR = {
  VENDER_SIN_EL: 'vender_sin_el',
  SUSPENDER_PRODUCTOS: 'suspender_productos',
  CANCELAR: 'cancelar',
}

const includeCompleto = {
  productoIngredientes: {
    include: { producto: { select: { id: true, nombre: true, estado: true, disponibleHoy: true } } },
  },
  modificadoresAfectados: { select: { id: true, nombre: true } },
  modificadoresSustitutos: { select: { id: true, nombre: true } },
}

export const listar = asyncHandler(async (_req, res) => {
  const ingredientes = await prisma.ingrediente.findMany({
    include: { productoIngredientes: { select: { id: true, productoId: true } } },
    orderBy: { nombre: 'asc' },
  })
  res.json(ingredientes)
})

export const obtener = asyncHandler(async (req, res) => {
  const { id } = req.params
  const ingrediente = await prisma.ingrediente.findUnique({
    where: { id: Number(id) },
    include: {
      ...includeCompleto,
      movimientosInventario: { orderBy: { fechaHora: 'desc' }, take: 20 },
    },
  })
  if (!ingrediente) throw new HttpError(404, 'Ingrediente no encontrado')
  res.json(ingrediente)
})

export const crear = asyncHandler(async (req, res) => {
  const { nombre, unidadMedida, stockActual, stockMinimoAlerta, costoUltimaCompra } = req.body
  if (!nombre || typeof nombre !== 'string') throw new HttpError(400, 'El campo nombre es obligatorio')
  if (!esEnumValido(unidadMedida, UNIDADES_MEDIDA)) throw new HttpError(400, 'unidadMedida inválida')
  if (typeof stockActual !== 'number' || typeof stockMinimoAlerta !== 'number') {
    throw new HttpError(400, 'stockActual y stockMinimoAlerta deben ser numéricos')
  }

  const ingrediente = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.ingrediente.create({
      data: {
        nombre,
        unidadMedida,
        stockActual,
        stockMinimoAlerta,
        costoUltimaCompra: costoUltimaCompra ?? null,
      },
    })
    await tx.movimiento_Inventario.create({
      data: { ingredienteId: nuevo.id, tipoMovimiento: 'Entrada', cantidad: stockActual },
    })
    if (costoUltimaCompra != null) {
      const usuarioId = await resolverUsuario(tx, req.body)
      await tx.gasto.create({
        data: {
          concepto: `Entrada de inventario: ${nuevo.nombre}`,
          monto: costoUltimaCompra,
          categoria: 'Insumos',
          metodoPago: 'Efectivo',
          origen: 'Automatico_por_entrada_inventario',
          usuarioId,
        },
      })
    }
    return nuevo
  })

  res.status(201).json(await prisma.ingrediente.findUnique({ where: { id: ingrediente.id }, include: includeCompleto }))
})

const CAMPOS_EDITABLES = ['nombre', 'unidadMedida', 'stockMinimoAlerta', 'costoUltimaCompra']

export const actualizar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.ingrediente.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Ingrediente no encontrado')

  const prohibidos = Object.keys(req.body).filter((k) => !CAMPOS_EDITABLES.includes(k))
  if (prohibidos.length > 0) {
    throw new HttpError(
      400,
      `No se pueden modificar estos campos: ${prohibidos.join(', ')}. El stock solo cambia mediante movimientos de inventario (docs/04)`
    )
  }
  if (req.body.unidadMedida && !esEnumValido(req.body.unidadMedida, UNIDADES_MEDIDA)) {
    throw new HttpError(400, 'unidadMedida inválida')
  }

  const data = {}
  for (const campo of CAMPOS_EDITABLES) {
    if (campo in req.body) data[campo] = req.body[campo] ?? null
  }

  const actualizado = await prisma.ingrediente.update({ where: { id: existente.id }, data })
  res.json(actualizado)
})

export const desactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const ingrediente = await prisma.ingrediente.findUnique({ where: { id: Number(id) } })
  if (!ingrediente) throw new HttpError(404, 'Ingrediente no encontrado')
  if (ingrediente.estado === 'Inactivo') throw new HttpError(400, 'El ingrediente ya está inactivo')

  const usosEnActivos = await prisma.producto_Ingrediente.findMany({
    where: { ingredienteId: ingrediente.id, producto: { estado: 'Activo' } },
    include: { producto: { select: { id: true, nombre: true, disponibleHoy: true } } },
  })
  const productosAfectados = usosEnActivos.map((u) => u.producto)

  if (productosAfectados.length === 0) {
    const desactivado = await prisma.ingrediente.update({
      where: { id: ingrediente.id },
      data: { estado: 'Inactivo' },
    })
    return res.json({ mensaje: 'Ingrediente desactivado', ingrediente: desactivado })
  }

  const opcion = req.body?.opcion
  if (!opcion) {
    return res.status(409).json({
      mensaje: 'Este ingrediente se usa en productos activos. Elige cómo proceder.',
      requiereConfirmacion: true,
      opciones: {
        [OPCIONES_DESACTIVAR.VENDER_SIN_EL]: 'Vender esos productos sin este ingrediente (se quita de su receta)',
        [OPCIONES_DESACTIVAR.SUSPENDER_PRODUCTOS]: 'Suspender esos productos también (disponible_hoy = false)',
        [OPCIONES_DESACTIVAR.CANCELAR]: 'Cancelar (no desactivar)',
      },
      productosAfectados,
    })
  }

  const idsAfectados = productosAfectados.map((p) => p.id)

  if (opcion === OPCIONES_DESACTIVAR.CANCELAR) {
    return res.json({ mensaje: 'Operación cancelada: el ingrediente no se desactivó', ingrediente })
  }

  if (opcion === OPCIONES_DESACTIVAR.VENDER_SIN_EL) {
    await prisma.$transaction(async (tx) => {
      await tx.producto_Ingrediente.deleteMany({
        where: { ingredienteId: ingrediente.id, productoId: { in: idsAfectados } },
      })
      await tx.ingrediente.update({ where: { id: ingrediente.id }, data: { estado: 'Inactivo' } })
    })
    return res.json({
      mensaje: 'Ingrediente desactivado y removido de las recetas de los productos indicados',
      ingrediente: await prisma.ingrediente.findUnique({ where: { id: ingrediente.id } }),
      productosAfectados,
    })
  }

  if (opcion === OPCIONES_DESACTIVAR.SUSPENDER_PRODUCTOS) {
    const combos = await prisma.combo_Producto.findMany({
      where: { productoId: { in: idsAfectados }, combo: { estado: 'Activo' } },
      select: { combo: { select: { id: true, nombre: true } } },
    })
    const combosSuspendidos = [...new Map(combos.map((c) => [c.combo.id, c.combo])).values()]
    const combosIds = combosSuspendidos.map((c) => c.id)

    await prisma.$transaction(async (tx) => {
      await tx.producto.updateMany({ where: { id: { in: idsAfectados } }, data: { disponibleHoy: false } })
      if (combosIds.length) await tx.combo.updateMany({ where: { id: { in: combosIds } }, data: { estado: 'Suspendido' } })
      await tx.ingrediente.update({ where: { id: ingrediente.id }, data: { estado: 'Inactivo' } })
    })

    return res.json({
      mensaje: 'Ingrediente desactivado. Los productos que lo usaban quedaron no disponibles hoy.',
      ingrediente: await prisma.ingrediente.findUnique({ where: { id: ingrediente.id } }),
      productosAfectados,
      ...(combosSuspendidos.length ? { aviso: { mensaje: 'Se suspendieron los combos que incluían esos productos', combosSuspendidos } } : {}),
    })
  }

  throw new HttpError(400, 'Opción inválida')
})

export const eliminar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const ingrediente = await prisma.ingrediente.findUnique({ where: { id: Number(id) } })
  if (!ingrediente) throw new HttpError(404, 'Ingrediente no encontrado')

  const recetas = await prisma.producto_Ingrediente.count({ where: { ingredienteId: ingrediente.id } })
  const movimientos = await prisma.movimiento_Inventario.count({ where: { ingredienteId: ingrediente.id } })
  const modificadores = await prisma.modificador.count({
    where: { OR: [{ ingredienteAfectadoId: ingrediente.id }, { ingredienteSustitutoId: ingrediente.id }] },
  })

  if (recetas > 0 || movimientos > 0 || modificadores > 0) {
    throw new HttpError(
      409,
      `No se puede eliminar: el ingrediente tiene registros asociados (recetas: ${recetas}, movimientos de inventario: ${movimientos}, modificadores: ${modificadores}). Desactívalo en su lugar.`
    )
  }

  await prisma.ingrediente.delete({ where: { id: ingrediente.id } })
  res.status(204).end()
})