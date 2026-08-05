import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'

// Configuración global de un solo registro (id = 1). Si aún no existe, se crea
// con valores por defecto (docs/06: costo_envio y repartidor_unico).
export async function obtenerConfiguracion(db) {
  const config = await db.configuracion.findUnique({ where: { id: 1 } })
  if (config) return config
  return db.configuracion.create({
    data: { id: 1, costoEnvio: 0, repartidorUnico: false },
  })
}

export const estadoConfig = asyncHandler(async (_req, res) => {
  const config = await obtenerConfiguracion(prisma)
  res.json({
    costoEnvio: config.costoEnvio,
    repartidorUnico: config.repartidorUnico,
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
  const config = await prisma.configuracion.update({ where: { id: 1 }, data: { costoEnvio } })
  res.json({ costoEnvio: config.costoEnvio })
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
  const config = await prisma.configuracion.update({ where: { id: 1 }, data: { repartidorUnico } })
  res.json({ repartidorUnico: config.repartidorUnico })
})
