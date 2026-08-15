export async function obtenerConfiguracion() {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch('/api/configuracion', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!respuesta.ok) {
    let mensaje = 'No se pudo cargar la configuración. Intenta de nuevo.'
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

export async function actualizarConfiguracion(cambios) {
  const token = localStorage.getItem('pos.token')
  const respuesta = await fetch('/api/configuracion', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cambios),
  })

  if (!respuesta.ok) {
    let mensaje = 'No se pudo guardar la configuración. Intenta de nuevo.'
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
