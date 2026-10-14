import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { TIPOS_MODIFICADOR, esEnumValido } from '../utils/enums.js'

const includeCompleto = {
  ingredienteAfectado: { select: { id: true, nombre: true, unidadMedida: true } },
  ingredienteSustituto: { select: { id: true, nombre: true, unidadMedida: true } },
  productoModificadores: { include: { producto: { select: { id: true, nombre: true } } } },
}

async function validarDatos(db, { tipo, ingredienteAfectadoId, ingredienteSustitutoId, cantidadExtra, cantidadSustituto, costoAdicional }) {
  if (tipo !== undefined && !esEnumValido(tipo, TIPOS_MODIFICADOR)) throw new HttpError(400, 'tipo inválido')
  if (cantidadExtra != null && (!Number.isFinite(cantidadExtra) || cantidadExtra <= 0)) {
    throw new HttpError(400, 'cantidadExtra debe ser un número mayor a 0')
  }
  if (cantidadSustituto != null && (!Number.isFinite(cantidadSustituto) || cantidadSustituto <= 0)) {
    throw new HttpError(400, 'cantidadSustituto debe ser un número mayor a 0')
  }
  if (costoAdicional !== undefined && (!Number.isFinite(costoAdicional) || costoAdicional < 0)) {
    throw new HttpError(400, 'costoAdicional debe ser un número mayor o igual a 0')
  }

  let afectadoId = ingredienteAfectadoId
  if (afectadoId !== undefined) {
    const afectado = await db.ingrediente.findUnique({ where: { id: Number(afectadoId) } })
    if (!afectado) throw new HttpError(404, 'ingredienteAfectadoId no existe')
    afectadoId = afectado.id
  }

  let sustitutoId = ingredienteSustitutoId
  if (tipo === 'Sustituir' && !sustitutoId) throw new HttpError(400, 'Un modificador de tipo Sustituir requiere ingredienteSustitutoId')
  if (sustitutoId !== undefined && sustitutoId !== null) {
    const sustituto = await db.ingrediente.findUnique({ where: { id: Number(sustitutoId) } })
    if (!sustituto) throw new HttpError(404, 'ingredienteSustitutoId no existe')
    sustitutoId = sustituto.id
  }

  if (tipo === 'Sustituir' && cantidadSustituto == null) {
    throw new HttpError(400, 'Un modificador de tipo Sustituir requiere cantidadSustituto mayor a 0')
  }

  const data = {}
  if (tipo !== undefined) data.tipo = tipo
  if (afectadoId !== undefined) data.ingredienteAfectadoId = afectadoId
  if (sustitutoId !== undefined) data.ingredienteSustitutoId = sustitutoId
  if (cantidadExtra !== undefined) data.cantidadExtra = tipo === 'Agregar' ? cantidadExtra : null
  if (cantidadSustituto !== undefined) data.cantidadSustituto = tipo === 'Sustituir' ? cantidadSustituto : null
  if (costoAdicional !== undefined) data.costoAdicional = costoAdicional
  return data
}

async function validarProductosParaModificador(db, productoIds, ingredienteAfectadoId) {
  if (!Array.isArray(productoIds)) {
    throw new HttpError(400, 'productoIds debe ser una lista de identificadores')
  }

  const ids = productoIds.map((id) => Number(id))
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new HttpError(400, 'Cada producto debe tener un identificador entero positivo')
  }
  if (new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'La lista productoIds no debe contener duplicados')
  }

  for (const id of ids) {
    const producto = await db.producto.findUnique({ where: { id } })
    if (!producto) throw new HttpError(404, `El producto ${id} no existe`)
    const enReceta = await db.producto_Ingrediente.count({
      where: { productoId: producto.id, ingredienteId: ingredienteAfectadoId },
    })
    if (enReceta === 0) {
      const ingrediente = await db.ingrediente.findUnique({
        where: { id: ingredienteAfectadoId },
        select: { nombre: true },
      })
      throw new HttpError(
        400,
        `El producto "${producto.nombre}" no incluye el ingrediente "${ingrediente?.nombre}" en su receta y no puede usar este modificador.`,
      )
    }
  }
  return ids
}

export const listar = asyncHandler(async (_req, res) => {
  const modificadores = await prisma.modificador.findMany({ include: includeCompleto, orderBy: { nombre: 'asc' } })
  res.json(modificadores)
})

export const obtener = asyncHandler(async (req, res) => {
  const { id } = req.params
  const modificador = await prisma.modificador.findUnique({ where: { id: Number(id) }, include: includeCompleto })
  if (!modificador) throw new HttpError(404, 'Modificador no encontrado')
  res.json(modificador)
})

export const crear = asyncHandler(async (req, res) => {
  const { nombre, tipo, ingredienteAfectadoId, ingredienteSustitutoId, cantidadExtra, cantidadSustituto, costoAdicional, productoIds } = req.body
  if (!nombre || typeof nombre !== 'string') throw new HttpError(400, 'El campo nombre es obligatorio')
  if (!esEnumValido(tipo, TIPOS_MODIFICADOR)) throw new HttpError(400, 'tipo inválido')
  if (tipo === 'Agregar' && cantidadExtra == null) {
    throw new HttpError(400, 'Un modificador de tipo Agregar requiere cantidadExtra mayor a 0')
  }

  const data = await validarDatos(prisma, {
    tipo,
    ingredienteAfectadoId,
    ingredienteSustitutoId,
    cantidadExtra,
    cantidadSustituto,
    costoAdicional,
  })
  data.nombre = nombre

  const productos = productoIds === undefined
    ? []
    : await validarProductosParaModificador(prisma, productoIds, data.ingredienteAfectadoId)

  const creado = await prisma.$transaction(async (tx) => {
    const modificador = await tx.modificador.create({ data })
    if (productos.length) {
      await tx.producto_Modificador.createMany({
        data: productos.map((productoId) => ({ productoId, modificadorId: modificador.id })),
      })
    }
    return modificador
  })

  res.status(201).json(await prisma.modificador.findUnique({ where: { id: creado.id }, include: includeCompleto }))
})

export const actualizar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const {
    nombre,
    tipo,
    ingredienteAfectadoId,
    ingredienteSustitutoId,
    cantidadExtra,
    cantidadSustituto,
    costoAdicional,
    productoIds,
  } = req.body

  const actualizado = await prisma.$transaction(async (tx) => {
    const existente = await tx.modificador.findUnique({ where: { id: Number(id) } })
    if (!existente) throw new HttpError(404, 'Modificador no encontrado')

    const tipoFinal = tipo ?? existente.tipo
    const cantidadExtraFinal =
      cantidadExtra !== undefined ? cantidadExtra : tipoFinal === existente.tipo ? existente.cantidadExtra : null
    const cantidadSustitutoFinal =
      cantidadSustituto !== undefined
        ? cantidadSustituto
        : tipoFinal === existente.tipo
          ? existente.cantidadSustituto
          : null
    const ingredienteSustitutoFinal =
      ingredienteSustitutoId !== undefined
        ? ingredienteSustitutoId
        : tipoFinal === existente.tipo
          ? existente.ingredienteSustitutoId
          : null
    if (tipoFinal === 'Agregar' && (!Number.isFinite(cantidadExtraFinal) || cantidadExtraFinal <= 0)) {
      throw new HttpError(400, 'Un modificador de tipo Agregar requiere cantidadExtra mayor a 0')
    }
    const data = await validarDatos(tx, {
      tipo: tipoFinal,
      ingredienteAfectadoId: ingredienteAfectadoId ?? existente.ingredienteAfectadoId,
      ingredienteSustitutoId: ingredienteSustitutoFinal,
      cantidadExtra: cantidadExtraFinal,
      cantidadSustituto: cantidadSustitutoFinal,
      costoAdicional: costoAdicional ?? existente.costoAdicional,
    })
    if (nombre !== undefined) {
      if (typeof nombre !== 'string' || !nombre.trim()) throw new HttpError(400, 'nombre inválido')
      data.nombre = nombre.trim()
    }

    const productos = productoIds === undefined
      ? null
      : await validarProductosParaModificador(tx, productoIds, data.ingredienteAfectadoId)

    await tx.modificador.update({ where: { id: existente.id }, data })
    if (productos !== null) {
      await tx.producto_Modificador.deleteMany({ where: { modificadorId: existente.id } })
      if (productos.length) {
        await tx.producto_Modificador.createMany({
          data: productos.map((productoId) => ({ productoId, modificadorId: existente.id })),
        })
      }
    }

    return tx.modificador.findUnique({
      where: { id: existente.id },
      include: includeCompleto,
    })
  })
  res.json(actualizado)
})

export const desactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.modificador.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Modificador no encontrado')
  if (existente.estado === 'Inactivo') throw new HttpError(400, 'El modificador ya está inactivo')
  const actualizado = await prisma.modificador.update({ where: { id: existente.id }, data: { estado: 'Inactivo' } })
  res.json(actualizado)
})

export const reactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.modificador.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Modificador no encontrado')
  if (existente.estado === 'Activo') throw new HttpError(400, 'El modificador ya está activo')

  const actualizado = await prisma.modificador.update({
    where: { id: existente.id },
    data: { estado: 'Activo' },
  })
  res.json(actualizado)
})

export const eliminar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.modificador.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Modificador no encontrado')

  const enProductos = await prisma.producto_Modificador.count({ where: { modificadorId: existente.id } })
  const enVentas = await prisma.venta_Producto_Modificador.count({ where: { modificadorId: existente.id } })
  if (enProductos > 0 || enVentas > 0) {
    throw new HttpError(
      409,
      `No se puede eliminar: el modificador tiene registros asociados (productos: ${enProductos}, ventas: ${enVentas}). Desactívalo en su lugar.`
    )
  }
  await prisma.modificador.delete({ where: { id: existente.id } })
  res.status(204).end()
})