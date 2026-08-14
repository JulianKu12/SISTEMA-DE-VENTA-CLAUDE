import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { TIPOS_MODIFICADOR, esEnumValido } from '../utils/enums.js'

const includeCompleto = {
  ingredienteAfectado: { select: { id: true, nombre: true, unidadMedida: true } },
  ingredienteSustituto: { select: { id: true, nombre: true, unidadMedida: true } },
  productoModificadores: { include: { producto: { select: { id: true, nombre: true } } } },
}

async function validarDatos({ tipo, ingredienteAfectadoId, ingredienteSustitutoId, cantidadExtra, cantidadSustituto, costoAdicional }) {
  if (tipo !== undefined && !esEnumValido(tipo, TIPOS_MODIFICADOR)) throw new HttpError(400, 'tipo inválido')

  let afectadoId = ingredienteAfectadoId
  if (afectadoId !== undefined) {
    const afectado = await prisma.ingrediente.findUnique({ where: { id: Number(afectadoId) } })
    if (!afectado) throw new HttpError(404, 'ingredienteAfectadoId no existe')
    afectadoId = afectado.id
  }

  let sustitutoId = ingredienteSustitutoId
  if (tipo === 'Sustituir' && !sustitutoId) throw new HttpError(400, 'Un modificador de tipo Sustituir requiere ingredienteSustitutoId')
  if (sustitutoId !== undefined && sustitutoId !== null) {
    const sustituto = await prisma.ingrediente.findUnique({ where: { id: Number(sustitutoId) } })
    if (!sustituto) throw new HttpError(404, 'ingredienteSustitutoId no existe')
    sustitutoId = sustituto.id
  }

  if (tipo === 'Sustituir' && (cantidadSustituto === undefined || cantidadSustituto === null || !(Number(cantidadSustituto) > 0))) {
    throw new HttpError(400, 'Un modificador de tipo Sustituir requiere cantidadSustituto mayor a 0')
  }

  const data = {}
  if (tipo !== undefined) data.tipo = tipo
  if (afectadoId !== undefined) data.ingredienteAfectadoId = afectadoId
  if (sustitutoId !== undefined) data.ingredienteSustitutoId = sustitutoId
  if (cantidadExtra !== undefined) data.cantidadExtra = tipo === 'Agregar' ? cantidadExtra : null
  if (cantidadSustituto !== undefined) data.cantidadSustituto = tipo === 'Sustituir' ? Number(cantidadSustituto) : null
  if (costoAdicional !== undefined) data.costoAdicional = costoAdicional
  return data
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

  const data = await validarDatos({ tipo, ingredienteAfectadoId, ingredienteSustitutoId, cantidadExtra, cantidadSustituto, costoAdicional })
  data.nombre = nombre

  let productos = []
  if (Array.isArray(productoIds) && productoIds.length) {
    for (const pid of productoIds) {
      const producto = await prisma.producto.findUnique({ where: { id: Number(pid) } })
      if (!producto) throw new HttpError(404, `El producto ${pid} no existe`)
      const enReceta = await prisma.producto_Ingrediente.count({
        where: { productoId: producto.id, ingredienteId: data.ingredienteAfectadoId },
      })
      if (enReceta === 0) {
        const ingrediente = await prisma.ingrediente.findUnique({
          where: { id: Number(data.ingredienteAfectadoId) },
          select: { nombre: true },
        })
        throw new HttpError(
          400,
          `El producto "${producto.nombre}" no incluye el ingrediente "${ingrediente?.nombre}" en su receta y no puede usar este modificador.`
        )
      }
      productos.push(producto.id)
    }
  }

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
  const existente = await prisma.modificador.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Modificador no encontrado')

  const { nombre, tipo, ingredienteAfectadoId, ingredienteSustitutoId, cantidadExtra, cantidadSustituto, costoAdicional } = req.body
  const data = await validarDatos({ tipo, ingredienteAfectadoId, ingredienteSustitutoId, cantidadExtra, cantidadSustituto, costoAdicional })
  if (nombre !== undefined) data.nombre = nombre

  const actualizado = await prisma.modificador.update({ where: { id: existente.id }, data })
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