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

// ---------------------------------------------------------------------------
// Ingredientes
// ---------------------------------------------------------------------------

export async function obtenerIngredientes() {
  const respuesta = await peticion('/api/ingredientes')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los ingredientes'))
  return respuesta.json()
}

export async function crearIngrediente(payload) {
  const respuesta = await peticion('/api/ingredientes', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo crear el ingrediente'))
  return respuesta.json()
}

export async function actualizarIngrediente(id, payload) {
  const respuesta = await peticion(`/api/ingredientes/${id}`, { metodo: 'PATCH', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo actualizar el ingrediente'))
  return respuesta.json()
}

export async function desactivarIngrediente(id, opcion) {
  const respuesta = await peticion(`/api/ingredientes/${id}/desactivar`, {
    metodo: 'PATCH',
    body: opcion ? { opcion } : {},
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok && !(respuesta.status === 409 && datos.requiereConfirmacion)) {
    throw new Error(datos.message || 'No se pudo desactivar el ingrediente')
  }
  return { status: respuesta.status, datos }
}

export async function eliminarIngrediente(id) {
  const respuesta = await peticion(`/api/ingredientes/${id}`, { metodo: 'DELETE' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo eliminar el ingrediente'))
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

export async function obtenerProductos() {
  const respuesta = await peticion('/api/productos')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los productos'))
  return respuesta.json()
}

export async function crearProducto(payload) {
  const respuesta = await peticion('/api/productos', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo crear el producto'))
  return respuesta.json()
}

export async function actualizarProducto(id, payload) {
  const respuesta = await peticion(`/api/productos/${id}`, { metodo: 'PATCH', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo actualizar el producto'))
  return respuesta.json()
}

export async function actualizarDisponibilidadProducto(id, disponibleHoy) {
  const respuesta = await peticion(`/api/productos/${id}/disponibilidad`, {
    metodo: 'PATCH',
    body: { disponibleHoy },
  })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo actualizar la disponibilidad'))
  return respuesta.json()
}

export async function desactivarProducto(id) {
  const respuesta = await peticion(`/api/productos/${id}/desactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo desactivar el producto'))
  return respuesta.json()
}

export async function eliminarProducto(id) {
  const respuesta = await peticion(`/api/productos/${id}`, { metodo: 'DELETE' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo eliminar el producto'))
}
