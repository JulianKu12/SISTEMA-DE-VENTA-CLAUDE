import { randomUUID } from 'node:crypto'
import { logInfo } from '../utils/logger.js'

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint()
  const requestId = randomUUID()
  const requestPath = req.path
  req.requestId = requestId
  req.requestPath = requestPath
  res.setHeader('X-Request-Id', requestId)

  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    logInfo('http.request.completed', {
      requestId,
      method: req.method,
      path: requestPath,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    })
  })

  next()
}
