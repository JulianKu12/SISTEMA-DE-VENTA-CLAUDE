import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { UNIDADES_MEDIDA, esEnumValido } from '../utils/enums.js'

const OPCIONES_ACCION = { VENDER_SIN_EL: 'vender_sin_el', SUSPENDER: 'suspender' }

const includeCompleto = {
  productoIngredientes: {
    include: { producto: { select: { id: true, nombre: true, estado: true, disponibleHoy: true } } },
  },
  modificadoresAfectados: { select: { id: true, nombre: true } },
  modificadoresSustitutos: { select: { id: true, nombre: true } },
}

// La unicidad se valida de forma case-insensitive (el índice de SQLite es
// sensible a mayúsculas/minúsculas, así que la comparación real se hace aquí).
async function validarNombreUnico(nombre, excluirId) {
  const normalizado = String(nombre).trim().toLowerCase()
  const existentes = await prisma.ingrediente.findMany({ select: { id: true, nombre: true } })
  const duplicado = existentes.find((e) => e.id !== excluirId && e.nombre.trim().toLowerCase() === normalizado)
  if (duplicado) {
    throw new HttpError(400, `Ya existe un ingrediente llamado "${duplicado.nombre}". El nombre debe ser único.`)
  }
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
  await validarNombreUnico(nombre)
  if (!esEnumValido(unidadMedida, UNIDADES_MEDIDA)) throw new HttpError(400, 'unidadMedida inválida')
  if (typeof stockActual !== 'number' || typeof stockMinimoAlerta !== 'number') {
    throw new HttpError(400, 'stockActual y stockMinimoAlerta deben ser numéricos')
  }

  let ingrediente
  try {
    ingrediente = await prisma.$transaction(async (tx) => {
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
      const usuarioId = resolverUsuario(req)
      // Se asocia al Dia_Operativo Abierto actual; si no hay ninguno, queda
      // null y se asocia al siguiente que se abra (mismo patrón que Gasto).
      const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
      await tx.gasto.create({
        data: {
          concepto: `Entrada de inventario: ${nuevo.nombre}`,
          monto: costoUltimaCompra,
          categoria: 'Insumos',
          metodoPago: 'Efectivo',
          origen: 'Automatico_por_entrada_inventario',
          diaOperativoId: dia?.id ?? null,
          usuarioId,
        },
      })
    }
    return nuevo
    })
  } catch (e) {
    if (e.code === 'P2002') {
      throw new HttpError(400, `Ya existe un ingrediente llamado "${nombre}". El nombre debe ser único.`)
    }
    throw e
  }

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
  if ('nombre' in data && data.nombre !== existente.nombre) {
    if (typeof data.nombre !== 'string' || !data.nombre.trim()) throw new HttpError(400, 'nombre inválido')
    await validarNombreUnico(data.nombre, existente.id)
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

  const decisiones = req.body?.decisiones
  if (decisiones === undefined) {
    return res.status(409).json({
      mensaje: 'Este ingrediente se usa en productos activos. Decide por cada producto qué hacer.',
      requiereConfirmacion: true,
      opciones: {
        [OPCIONES_ACCION.VENDER_SIN_EL]: 'Vender el producto sin este ingrediente (se quita de su receta)',
        [OPCIONES_ACCION.SUSPENDER]: 'Suspender el producto (disponible_hoy = false)',
      },
      productosAfectados,
    })
  }
  if (!Array.isArray(decisiones) || decisiones.length === 0) {
    throw new HttpError(400, 'Selecciona una acción (vender_sin_el o suspender) para cada producto afectado')
  }

  const mapa = new Map()
  for (const d of decisiones) {
    const productoId = Number(d?.productoId)
    const accion = d?.accion
    if (!productoId || ![OPCIONES_ACCION.VENDER_SIN_EL, OPCIONES_ACCION.SUSPENDER].includes(accion)) {
      throw new HttpError(400, 'Cada decisión requiere productoId y una acción válida (vender_sin_el o suspender)')
    }
    if (mapa.has(productoId)) throw new HttpError(400, `El producto ${productoId} tiene más de una decisión`)
    mapa.set(productoId, accion)
  }

  const idsAfectados = productosAfectados.map((p) => p.id)
  const sinDecision = idsAfectados.filter((pid) => !mapa.has(pid))
  if (sinDecision.length > 0) {
    throw new HttpError(
      400,
      `Falta la decisión para los productos: ${productosAfectados
        .filter((p) => sinDecision.includes(p.id))
        .map((p) => p.nombre)
        .join(', ')}`
    )
  }

  const idsVender = idsAfectados.filter((pid) => mapa.get(pid) === OPCIONES_ACCION.VENDER_SIN_EL)
  const idsSuspender = idsAfectados.filter((pid) => mapa.get(pid) === OPCIONES_ACCION.SUSPENDER)

  const resultado = await prisma.$transaction(async (tx) => {
    if (idsVender.length) {
      await tx.producto_Ingrediente.deleteMany({
        where: { ingredienteId: ingrediente.id, productoId: { in: idsVender } },
      })
    }
    let combosSuspendidos = []
    if (idsSuspender.length) {
      await tx.producto.updateMany({ where: { id: { in: idsSuspender } }, data: { disponibleHoy: false } })
      const combos = await tx.combo_Producto.findMany({
        where: { productoId: { in: idsSuspender }, combo: { estado: 'Activo' } },
        select: { combo: { select: { id: true, nombre: true } } },
      })
      combosSuspendidos = [...new Map(combos.map((c) => [c.combo.id, c.combo])).values()]
      if (combosSuspendidos.length) {
        await tx.combo.updateMany({
          where: { id: { in: combosSuspendidos.map((c) => c.id) } },
          data: { estado: 'Suspendido' },
        })
      }
    }
    await tx.ingrediente.update({ where: { id: ingrediente.id }, data: { estado: 'Inactivo' } })
    return combosSuspendidos
  })

  res.json({
    mensaje: 'Ingrediente desactivado. Cada producto se procesó según la acción elegida.',
    ingrediente: await prisma.ingrediente.findUnique({ where: { id: ingrediente.id } }),
    productosAfectados,
    ...(resultado.length
      ? { aviso: { mensaje: 'Se suspendieron los combos que incluían los productos suspendidos', combosSuspendidos: resultado } }
      : {}),
  })
})

export const reactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.ingrediente.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Ingrediente no encontrado')
  if (existente.estado === 'Activo') throw new HttpError(400, 'El ingrediente ya está activo')

  const reactivado = await prisma.ingrediente.update({
    where: { id: existente.id },
    data: { estado: 'Activo' },
  })
  res.json({ mensaje: 'Ingrediente reactivado', ingrediente: reactivado })
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