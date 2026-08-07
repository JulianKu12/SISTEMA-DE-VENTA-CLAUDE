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

async function peticionAutenticada(ruta, opciones = {}) {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opciones.headers || {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  })

  if (!respuesta.ok) {
    throw new Error(await extraerMensaje(respuesta, 'No se pudieron actualizar los datos. Intenta de nuevo.'))
  }

  return respuesta.json()
}

export async function obtenerPedido(id) {
  return peticionAutenticada(`/api/pedidos/${id}/detalle`)
}

export async function cambiarEstadoPago(id, payload) {
  return peticionAutenticada(`/api/pedidos/${id}/estado-pago`, {
    method: 'PATCH',
    body: payload,
  })
}

export async function cambiarEstadoPreparacion(id, payload) {
  return peticionAutenticada(`/api/pedidos/${id}/estado-preparacion`, {
    method: 'PATCH',
    body: payload,
  })
}

export async function editarPedido(id, payload) {
  return peticionAutenticada(`/api/pedidos/${id}`, {
    method: 'PATCH',
    body: payload,
  })
}

export async function obtenerRepartidoresDisponibles() {
  const empleados = await peticionAutenticada('/api/empleados')
  return (empleados || []).filter((e) => e.estadoDisponibilidad === 'Disponible')
}
