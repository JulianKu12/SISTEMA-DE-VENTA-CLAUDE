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

  if (respuesta.status === 204) return undefined

  return respuesta.json()
}

export function listarClientes() {
  return peticionAutenticada('/api/clientes')
}

export function crearCliente(datos) {
  return peticionAutenticada('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

export function actualizarCliente(clienteId, datos) {
  return peticionAutenticada(`/api/clientes/${clienteId}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  })
}

export function eliminarCliente(clienteId) {
  return peticionAutenticada(`/api/clientes/${clienteId}`, { method: 'DELETE' })
}

export function obtenerCliente(clienteId) {
  return peticionAutenticada(`/api/clientes/${clienteId}`)
}

export function crearReferencia(clienteId, descripcion) {
  return peticionAutenticada(`/api/clientes/${clienteId}/referencias`, {
    method: 'POST',
    body: JSON.stringify({ descripcion }),
  })
}

export function actualizarReferencia(referenciaId, datos) {
  return peticionAutenticada(`/api/clientes/referencias/${referenciaId}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  })
}

export function eliminarReferencia(referenciaId) {
  return peticionAutenticada(`/api/clientes/referencias/${referenciaId}`, {
    method: 'DELETE',
  })
}
