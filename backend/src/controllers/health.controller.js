import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { logError } from '../utils/logger.js'

export function healthController(_req, res) {
  res.status(200).json({ status: 'ok' })
}

export const readinessController = asyncHandler(async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.status(200).json({ status: 'ready', database: 'ok' })
  } catch (error) {
    logError('health.database_unavailable', {
      requestId: req.requestId,
      errorName: error?.name || 'Error',
      errorCode: typeof error?.code === 'string' ? error.code : undefined,
    })
    res.status(503).json({ status: 'not_ready', database: 'unavailable' })
  }
})