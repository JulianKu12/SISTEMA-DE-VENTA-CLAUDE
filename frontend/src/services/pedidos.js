// Arma un Error con el message del servidor y adjunta los detalles de stock
// (stockInsuficiente con nombre de cada faltante) y opcionesPrecio, para que
// las páginas puedan mostrar el detalle exacto.
async function construirError(respuesta, mensajePorDefecto) {
  let datos = null
  try {
    datos = await respuesta.json()
  } catch {
    // respuesta sin cuerpo JSON: se conserva el mensaje por defecto
  }
  const e = new Error(datos?.message || mensajePorDefecto)
  e.status = respuesta.status
  if (datos?.stockInsuficiente) e.stockInsuficiente = datos.stockInsuficiente
  if (datos?.opcionesPrecio) e.opcionesPrecio = datos.opcionesPrecio
  if (datos?.nuevoTotal != null) e.nuevoTotal = datos.nuevoTotal
  return e
}

export async function obtenerPedidos() {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch('/api/pedidos', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!respuesta.ok) {
    throw await construirError(respuesta, 'No se pudieron cargar los pedidos. Intenta de nuevo.')
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
    throw await construirError(respuesta, 'No se pudo crear el pedido. Intenta de nuevo.')
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
    throw await construirError(respuesta, 'No se pudieron actualizar los datos. Intenta de nuevo.')
  }

  return respuesta.json()
}

export async function obtenerPedido(id) {
  return peticionAutenticada(`/api/pedidos/${id}/detalle`)
}

export async function obtenerPedidosRepartidor(repartidorId) {
  return peticionAutenticada(`/api/pedidos/repartidor/${repartidorId}`)
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
