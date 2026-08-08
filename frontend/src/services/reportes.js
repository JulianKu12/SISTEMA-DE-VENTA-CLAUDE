async function peticionAutenticada(ruta, opciones = {}) {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opciones.headers || {}),
    },
  })

  if (!respuesta.ok) {
    let mensaje = 'No se pudo conectar con el servidor. Intenta de nuevo.'
    try {
      const datos = await respuesta.json()
      if (datos?.message) mensaje = datos.message
    } catch {
      // respuesta sin cuerpo JSON: se conserva el mensaje por defecto
    }
    throw new Error(mensaje)
  }

  return respuesta.json()
}

export function listarVentas(consulta = {}) {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(consulta)) {
    if (valor !== undefined && valor !== null && valor !== '') params.set(clave, valor)
  }
  const sufijo = params.toString()
  return peticionAutenticada(`/api/ventas${sufijo ? `?${sufijo}` : ''}`)
}

export function listarNoCobrar() {
  return peticionAutenticada('/api/ventas/no-cobrar')
}

export function listarDevoluciones() {
  return peticionAutenticada('/api/devoluciones')
}