async function peticionAutenticada(ruta) {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch(ruta, {
    headers: { Authorization: `Bearer ${token}` },
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

export function obtenerProductos() {
  return peticionAutenticada('/api/productos?disponibleHoy=true&estado=Activo')
}

export function obtenerCombos() {
  return peticionAutenticada('/api/combos')
}
