export async function obtenerPedidos() {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch('/api/pedidos', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!respuesta.ok) {
    let mensaje = 'No se pudieron cargar los pedidos. Intenta de nuevo.'
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
