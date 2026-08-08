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

export function obtenerStock() {
  return peticionAutenticada('/api/inventario/stock')
}

export function registrarEntrada(payload) {
  return peticionAutenticada('/api/inventario/entrada', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function registrarAjuste(payload) {
  return peticionAutenticada('/api/inventario/ajuste', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
