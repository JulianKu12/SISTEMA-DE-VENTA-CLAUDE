export function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Ruta no encontrada' })
}

export function errorHandler(err, _req, res, _next) {
  if (err?.code === 'P2025') {
    return res.status(404).json({ message: 'Recurso no encontrado' })
  }
  if (err?.code === 'P2002') {
    return res.status(409).json({ message: 'Ya existe un registro con esos datos únicos' })
  }
  if (err?.code === 'P2003') {
    return res.status(409).json({ message: 'No se puede realizar la operación por referencias existentes' })
  }
  const status = err?.status || 500
  const message = err?.message || 'Error interno del servidor'
  if (status >= 500) console.error(err)
  const body = { message }
  if (err?.faltantes) body.stockInsuficiente = err.faltantes
  if (err?.nuevoTotal != null) body.nuevoTotal = err.nuevoTotal
  res.status(status).json(body)
}