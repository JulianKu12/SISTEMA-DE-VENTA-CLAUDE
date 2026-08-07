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

export function listarClientes() {
  return peticionAutenticada('/api/clientes')
}

export function crearCliente(datos) {
  return peticionAutenticada('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(datos),
  })
}

export function crearReferencia(clienteId, descripcion) {
  return peticionAutenticada(`/api/clientes/${clienteId}/referencias`, {
    method: 'POST',
    body: JSON.stringify({ descripcion }),
  })
}
