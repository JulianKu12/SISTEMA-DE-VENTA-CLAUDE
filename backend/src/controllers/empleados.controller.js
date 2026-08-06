import bcrypt from 'bcrypt'
import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { ESTADOS_DISPONIBILIDAD, esEnumValido } from '../utils/enums.js'

const includeEmpleado = {
  usuario: { select: { id: true, tipo: true, usuario: true } },
  _count: { select: { pedidos: true } },
}

export const listar = asyncHandler(async (_req, res) => {
  const empleados = await prisma.empleado.findMany({
    include: includeEmpleado,
    orderBy: { nombre: 'asc' },
  })
  res.json(empleados)
})

export const obtener = asyncHandler(async (req, res) => {
  const { id } = req.params
  const empleado = await prisma.empleado.findUnique({
    where: { id: Number(id) },
    include: {
      ...includeEmpleado,
      pedidos: { orderBy: { fechaHoraCreacion: 'desc' } },
    },
  })
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado')
  res.json(empleado)
})

// Alta de Repartidor: se crea junto con su Usuario de login individual
// (tipo fijo Repartidor, docs/06 y docs/07).
export const crear = asyncHandler(async (req, res) => {
  const { nombre, usuario, contraseña, estadoDisponibilidad } = req.body
  if (!nombre || typeof nombre !== 'string' || !nombre.trim()) {
    throw new HttpError(400, 'El campo nombre es obligatorio')
  }
  if (!usuario || typeof usuario !== 'string' || !usuario.trim()) {
    throw new HttpError(400, 'El campo usuario (login) es obligatorio')
  }
  if (!contraseña || typeof contraseña !== 'string' || contraseña.length < 3) {
    throw new HttpError(400, 'contraseña es obligatoria (mínimo 3 caracteres)')
  }
  if (estadoDisponibilidad !== undefined && !esEnumValido(estadoDisponibilidad, ESTADOS_DISPONIBILIDAD)) {
    throw new HttpError(400, 'estadoDisponibilidad inválido (Disponible, No_disponible_hoy o Inactivo)')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const cuenta = await tx.usuario.create({
      data: {
        tipo: 'Repartidor',
        nombre: nombre.trim(),
        usuario: usuario.trim(),
        contraseña: await bcrypt.hash(contraseña, 10),
      },
    })
    const empleado = await tx.empleado.create({
      data: {
        nombre: nombre.trim(),
        estadoDisponibilidad: estadoDisponibilidad ?? 'Disponible',
        usuarioId: cuenta.id,
      },
    })
    return tx.empleado.findUnique({ where: { id: empleado.id }, include: includeEmpleado })
  })

  res.status(201).json(resultado)
})

const CAMPOS_EDITABLES = ['nombre', 'estadoDisponibilidad', 'usuario', 'contraseña']

export const actualizar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const existente = await prisma.empleado.findUnique({ where: { id: Number(id) } })
  if (!existente) throw new HttpError(404, 'Empleado no encontrado')

  const prohibidos = Object.keys(req.body).filter((k) => !CAMPOS_EDITABLES.includes(k))
  if (prohibidos.length > 0) {
    throw new HttpError(400, `No se pueden modificar estos campos: ${prohibidos.join(', ')}`)
  }
  if (req.body.nombre !== undefined && (!req.body.nombre || typeof req.body.nombre !== 'string')) {
    throw new HttpError(400, 'nombre inválido')
  }
  if (req.body.estadoDisponibilidad !== undefined && !esEnumValido(req.body.estadoDisponibilidad, ESTADOS_DISPONIBILIDAD)) {
    throw new HttpError(400, 'estadoDisponibilidad inválido')
  }
  if (req.body.usuario !== undefined && (!req.body.usuario || typeof req.body.usuario !== 'string')) {
    throw new HttpError(400, 'usuario inválido')
  }
  if (req.body.contraseña !== undefined && (typeof req.body.contraseña !== 'string' || req.body.contraseña.length < 3)) {
    throw new HttpError(400, 'contraseña inválida (mínimo 3 caracteres)')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const dataEmpleado = {}
    if ('nombre' in req.body) dataEmpleado.nombre = req.body.nombre?.trim()
    if ('estadoDisponibilidad' in req.body) dataEmpleado.estadoDisponibilidad = req.body.estadoDisponibilidad

    if (Object.keys(dataEmpleado).length > 0) {
      await tx.empleado.update({ where: { id: existente.id }, data: dataEmpleado })
    }

    if (('usuario' in req.body || 'contraseña' in req.body) && existente.usuarioId) {
      const dataUsuario = {}
      if ('usuario' in req.body) dataUsuario.usuario = req.body.usuario?.trim()
      if ('contraseña' in req.body) dataUsuario.contraseña = await bcrypt.hash(req.body.contraseña, 10)
      try {
        await tx.usuario.update({ where: { id: existente.usuarioId }, data: dataUsuario })
      } catch (e) {
        if (e.code === 'P2002') throw new HttpError(409, 'Ese usuario (login) ya está en uso')
        throw e
      }
    }

    return tx.empleado.findUnique({ where: { id: existente.id }, include: includeEmpleado })
  })

  res.json(resultado)
})

// Regla transversal (docs/00): Inactivo no se elimina si tiene historial de
// entregas; solo se desactiva. Eliminar solo si nunca tuvo pedidos asignados.
export const eliminar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const empleado = await prisma.empleado.findUnique({ where: { id: Number(id) } })
  if (!empleado) throw new HttpError(404, 'Empleado no encontrado')

  const pedidos = await prisma.pedido.count({ where: { repartidorId: empleado.id } })
  if (pedidos > 0) {
    throw new HttpError(
      409,
      'El empleado tiene pedidos asociados y no se puede eliminar. Desactívalo (estadoDisponibilidad = Inactivo) para conservar la trazabilidad.'
    )
  }

  await prisma.$transaction(async (tx) => {
    if (empleado.usuarioId) {
      await tx.usuario.delete({ where: { id: empleado.usuarioId } })
    }
    await tx.empleado.delete({ where: { id: empleado.id } })
  })
  res.status(204).end()
})
