import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { ESTADOS, esEnumValido } from '../utils/enums.js'

const includeCliente = {
  referencias: { orderBy: { id: 'asc' } },
  _count: { select: { pedidos: true } },
}

export const listar = asyncHandler(async (_req, res) => {
  const clientes = await prisma.cliente.findMany({
    include: includeCliente,
    orderBy: { nombre: 'asc' },
  })
  res.json(clientes)
})

export const obtener = asyncHandler(async (req, res) => {
  const { id } = req.params
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(id) },
    include: {
      ...includeCliente,
      pedidos: { orderBy: { fechaHoraCreacion: 'desc' } },
    },
  })
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado')
  res.json(cliente)
})

export const crear = asyncHandler(async (req, res) => {
  const { nombre, telefono } = req.body
  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    throw new HttpError(400, 'El campo nombre es obligatorio')
  }
  if (telefono !== undefined && typeof telefono !== 'string') {
    throw new HttpError(400, 'telefono debe ser texto (o omitirlo)')
  }

  const cliente = await prisma.cliente.create({
    data: { nombre: nombre.trim(), telefono: telefono ?? null },
    include: includeCliente,
  })
  res.status(201).json(cliente)
})

const CAMPOS_EDITABLES = ['nombre', 'telefono', 'estado']

export const actualizar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.cliente.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Cliente no encontrado')

  const prohibidos = Object.keys(req.body).filter((k) => !CAMPOS_EDITABLES.includes(k))
  if (prohibidos.length > 0) {
    throw new HttpError(400, `No se pueden modificar estos campos: ${prohibidos.join(', ')}`)
  }
  if (req.body.nombre !== undefined && (!req.body.nombre || typeof req.body.nombre !== 'string')) {
    throw new HttpError(400, 'nombre inválido')
  }
  if (req.body.telefono !== undefined && req.body.telefono !== null && typeof req.body.telefono !== 'string') {
    throw new HttpError(400, 'telefono inválido')
  }
  if (req.body.estado !== undefined && !esEnumValido(req.body.estado, ESTADOS)) {
    throw new HttpError(400, 'estado inválido (Activo o Inactivo)')
  }

  const data = {}
  if ('nombre' in req.body) data.nombre = req.body.nombre?.trim()
  if ('telefono' in req.body) data.telefono = req.body.telefono ?? null
  if ('estado' in req.body) data.estado = req.body.estado

  const actualizado = await prisma.cliente.update({
    where: { id: existente.id },
    data,
    include: includeCliente,
  })
  res.json(actualizado)
})

// Regla transversal (docs/00): se elimina solo si nunca tuvo pedidos; si ya
// tiene historial, se desactiva en vez de eliminar.
export const eliminar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(id) } })
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado')

  const pedidos = await prisma.pedido.count({ where: { clienteId: cliente.id } })
  if (pedidos > 0) {
    throw new HttpError(
      409,
      'El cliente tiene pedidos asociados y no se puede eliminar. Desactívalo (estado = Inactivo) para conservar el historial.'
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.cliente_Referencia.deleteMany({ where: { clienteId: cliente.id } })
    await tx.cliente.delete({ where: { id: cliente.id } })
  })
  res.status(204).end()
})

// --- Referencias de cliente -------------------------------------------------

export const listarReferencias = asyncHandler(async (req, res) => {
  const { id } = req.params
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(id) } })
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado')
  const referencias = await prisma.cliente_Referencia.findMany({
    where: { clienteId: cliente.id },
    orderBy: { id: 'asc' },
  })
  res.json(referencias)
})

export const crearReferencia = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { descripcion } = req.body
  const cliente = await prisma.cliente.findUnique({ where: { id: Number(id) } })
  if (!cliente) throw new HttpError(404, 'Cliente no encontrado')
  if (!descripcion || typeof descripcion !== 'string' || !descripcion.trim()) {
    throw new HttpError(400, 'descripcion es obligatoria (texto libre, p. ej. "casa azul, frente a la tienda")')
  }
  const referencia = await prisma.cliente_Referencia.create({
    data: { clienteId: cliente.id, descripcion: descripcion.trim() },
  })
  res.status(201).json(referencia)
})

export const actualizarReferencia = asyncHandler(async (req, res) => {
  const { referenciaId } = req.params
  const existente = await prisma.cliente_Referencia.findUnique({ where: { id: Number(referenciaId) } })
  if (!existente) throw new HttpError(404, 'Referencia no encontrada')

  const prohibidos = Object.keys(req.body).filter((k) => !['descripcion', 'estado'].includes(k))
  if (prohibidos.length > 0) {
    throw new HttpError(400, `No se pueden modificar estos campos: ${prohibidos.join(', ')}`)
  }
  if (req.body.descripcion !== undefined && (!req.body.descripcion || typeof req.body.descripcion !== 'string')) {
    throw new HttpError(400, 'descripcion inválida')
  }
  if (req.body.estado !== undefined && !esEnumValido(req.body.estado, ESTADOS)) {
    throw new HttpError(400, 'estado inválido (Activo o Inactivo)')
  }

  const data = {}
  if ('descripcion' in req.body) data.descripcion = req.body.descripcion?.trim()
  if ('estado' in req.body) data.estado = req.body.estado

  const actualizada = await prisma.cliente_Referencia.update({ where: { id: existente.id }, data })
  res.json(actualizada)
})

export const eliminarReferencia = asyncHandler(async (req, res) => {
  const { referenciaId } = req.params
  const referencia = await prisma.cliente_Referencia.findUnique({ where: { id: Number(referenciaId) } })
  if (!referencia) throw new HttpError(404, 'Referencia no encontrada')

  const pedidos = await prisma.pedido.count({ where: { referenciaId: referencia.id } })
  if (pedidos > 0) {
    throw new HttpError(
      409,
      'La referencia está asociada a pedidos y no se puede eliminar. Desactívala (estado = Inactivo).'
    )
  }
  await prisma.cliente_Referencia.delete({ where: { id: referencia.id } })
  res.status(204).end()
})
