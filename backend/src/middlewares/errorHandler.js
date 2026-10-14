import { logError } from '../utils/logger.js'

export function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Ruta no encontrada' })
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'La petición excede el tamaño máximo permitido (1mb)' })
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'El cuerpo de la petición no es JSON válido' })
  }
  if (err?.code === 'P2025') {
    return res.status(404).json({ message: 'Recurso no encontrado' })
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos únicos' })
  }
  if (err?.code === 'P2003') {
    return res.status(409).json({ message: 'No se puede realizar la operación por referencias existentes' })
  }
  const status =
    Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500
  const message = status === 500 ? 'Error interno del servidor' : err?.message || 'Error en la petición'
  if (status === 500) {
    logError('http.request.failed', {
      requestId: req.requestId,
      method: req.method,
      path: req.requestPath || req.path,
      statusCode: status,
      errorName: err?.name || 'Error',
      errorCode: typeof err?.code === 'string' ? err.code : undefined,
    })
  }
  const body = { message }
  if (status < 500) {
    if (err?.faltantes) body.stockInsuficiente = err.faltantes
    if (err?.nuevoTotal != null) body.nuevoTotal = err.nuevoTotal
  }
  res.status(status).json(body)
}