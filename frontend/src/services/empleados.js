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

const token = () => localStorage.getItem('pos.token')

async function peticion(ruta, { metodo = 'GET', body } = {}) {
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return respuesta
}

export async function obtenerEmpleados() {
  const respuesta = await peticion('/api/empleados')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los repartidores'))
  return respuesta.json()
}

export async function crearEmpleado(payload) {
  const respuesta = await peticion('/api/empleados', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo crear el repartidor'))
  return respuesta.json()
}

export async function actualizarEmpleado(id, payload) {
  const respuesta = await peticion(`/api/empleados/${id}`, { metodo: 'PATCH', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo actualizar el repartidor'))
  return respuesta.json()
}
