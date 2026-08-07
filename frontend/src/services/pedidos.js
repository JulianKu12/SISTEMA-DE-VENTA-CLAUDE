async function extraerMensaje(respuesta, mensajePorDefecto) {
  let mensaje = mensajePorDefecto
  try {
    const datos = await respuesta.json()
    if (datos?.message) mensaje = datos.message
  } catch {
    // respuesta sin cuerpo JSON: se conserva el mensaje por defecto
  }
  return mensaje
}

export async function obtenerPedidos() {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch('/api/pedidos', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!respuesta.ok) {
    throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los pedidos. Intenta de nuevo.'))
  }

  return respuesta.json()
}

export async function crearPedido(payload) {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch('/api/pedidos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!respuesta.ok) {
    throw new Error(await extraerMensaje(respuesta, 'No se pudo crear el pedido. Intenta de nuevo.'))
  }

  return respuesta.json()
}
