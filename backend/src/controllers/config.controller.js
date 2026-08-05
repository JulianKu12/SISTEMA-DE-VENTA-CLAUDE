import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'

// Configuración global de un solo registro (id = 1). Si aún no existe, se crea
// con valores por defecto (docs/06 y docs/07: costo_envio, repartidor_unico y
// opciones de cambio).
export async function obtenerConfiguracion(db) {
  const config = await db.configuracion.findUnique({ where: { id: 1 } })
  if (config) return config
  return db.configuracion.create({
    data: { id: 1, costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] },
  })
}

function normalizarOpcionesCambio(opciones) {
  if (!Array.isArray(opciones) || opciones.length === 0) {
    throw new HttpError(400, 'opcionesCambio debe ser una lista con al menos un monto')
  }
  const vistos = new Set()
  const limpio = []
  for (const monto of opciones) {
    if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
      throw new HttpError(400, 'opcionesCambio solo admite montos numéricos mayores a 0')
    }
    if (!vistos.has(monto)) {
      vistos.add(monto)
      limpio.push(monto)
    }
  }
  return limpio.sort((a, b) => a - b)
}

// GET /api/config y GET /api/configuracion — lectura completa de la
// configuración global (docs/06 y docs/07).
export const estadoConfig = asyncHandler(async (_req, res) => {
  const config = await obtenerConfiguracion(prisma)
  res.json({
    costoEnvio: config.costoEnvio,
    repartidorUnico: config.repartidorUnico,
    opcionesCambio: config.opcionesCambio,
  })
})

// PATCH /api/configuracion — modifica solo los campos enviados. Solo
// Administrador (se aplica en las rutas). Validaciones por campo.
export const actualizarConfiguracion = asyncHandler(async (req, res) => {
  const { costoEnvio, repartidorUnico, opcionesCambio } = req.body
  const data = {}

  if (costoEnvio !== undefined) {
    if (typeof costoEnvio !== 'number' || !Number.isFinite(costoEnvio) || costoEnvio < 0) {
      throw new HttpError(400, 'costoEnvio debe ser un número mayor o igual a 0')
    }
    data.costoEnvio = costoEnvio
  }

  if (repartidorUnico !== undefined) {
    if (typeof repartidorUnico !== 'boolean') {
      throw new HttpError(400, 'repartidorUnico debe ser un booleano')
    }
    data.repartidorUnico = repartidorUnico
  }

  if (opcionesCambio !== undefined) {
    data.opcionesCambio = normalizarOpcionesCambio(opcionesCambio)
  }

  if (Object.keys(data).length === 0) {
    throw new HttpError(400, 'Envía al menos un campo a modificar (costoEnvio, repartidorUnico u opcionesCambio)')
  }

  await prisma.configuracion.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500], ...data },
  })

  const config = await obtenerConfiguracion(prisma)
  res.json({
    costoEnvio: config.costoEnvio,
    repartidorUnico: config.repartidorUnico,
    opcionesCambio: config.opcionesCambio,
  })
})

export const obtenerCostoEnvio = asyncHandler(async (_req, res) => {
  const config = await obtenerConfiguracion(prisma)
  res.json({ costoEnvio: config.costoEnvio })
})

export const actualizarCostoEnvio = asyncHandler(async (req, res) => {
  const { costoEnvio } = req.body
  if (typeof costoEnvio !== 'number' || costoEnvio < 0) {
    throw new HttpError(400, 'costoEnvio debe ser un número mayor o igual a 0')
  }
  await prisma.configuracion.upsert({
    where: { id: 1 },
    update: { costoEnvio },
    create: { id: 1, costoEnvio, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] },
  })
  res.json({ costoEnvio })
})

export const obtenerRepartidorUnico = asyncHandler(async (_req, res) => {
  const config = await obtenerConfiguracion(prisma)
  res.json({ repartidorUnico: config.repartidorUnico })
})

export const actualizarRepartidorUnico = asyncHandler(async (req, res) => {
  const { repartidorUnico } = req.body
  if (typeof repartidorUnico !== 'boolean') {
    throw new HttpError(400, 'repartidorUnico debe ser un booleano')
  }
  await prisma.configuracion.upsert({
    where: { id: 1 },
    update: { repartidorUnico },
    create: { id: 1, costoEnvio: 0, repartidorUnico, opcionesCambio: [50, 100, 200, 500] },
  })
  res.json({ repartidorUnico })
})
