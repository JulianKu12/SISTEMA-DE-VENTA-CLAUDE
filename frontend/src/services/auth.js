export async function iniciarSesion({ usuario, contraseña }) {
  const respuesta = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, contraseña }),
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
