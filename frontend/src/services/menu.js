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

export async function desactivarIngrediente(id, decisiones) {
  const respuesta = await peticion(`/api/ingredientes/${id}/desactivar`, {
    metodo: 'PATCH',
    body: Array.isArray(decisiones) && decisiones.length ? { decisiones } : {},
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok && !(respuesta.status === 409 && datos.requiereConfirmacion)) {
    throw new Error(datos.message || 'No se pudo desactivar el ingrediente')
  }
  return { status: respuesta.status, datos }
}

export async function reactivarIngrediente(id) {
  const respuesta = await peticion(`/api/ingredientes/${id}/reactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo reactivar el ingrediente'))
  return respuesta.json()
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

export async function reactivarProducto(id) {
  const respuesta = await peticion(`/api/productos/${id}/reactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo reactivar el producto'))
  return respuesta.json()
}

export async function eliminarProducto(id) {
  const respuesta = await peticion(`/api/productos/${id}`, { metodo: 'DELETE' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo eliminar el producto'))
}

export async function asociarModificadorAProducto(productoId, modificadorId) {
  const respuesta = await peticion(`/api/productos/${productoId}/modificadores`, {
    metodo: 'POST',
    body: { modificadorId },
  })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo asociar el modificador al producto'))
  return respuesta.json()
}

export async function desasociarModificadorDeProducto(productoId, modificadorId) {
  const respuesta = await peticion(`/api/productos/${productoId}/modificadores/${modificadorId}`, { metodo: 'DELETE' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo desasociar el modificador del producto'))
}

// ---------------------------------------------------------------------------
// Modificadores
// ---------------------------------------------------------------------------

export async function obtenerModificadores() {
  const respuesta = await peticion('/api/modificadores')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los modificadores'))
  return respuesta.json()
}

export async function crearModificador(payload) {
  const respuesta = await peticion('/api/modificadores', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo crear el modificador'))
  return respuesta.json()
}

export async function actualizarModificador(id, payload) {
  const respuesta = await peticion(`/api/modificadores/${id}`, { metodo: 'PATCH', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo actualizar el modificador'))
  return respuesta.json()
}

export async function desactivarModificador(id) {
  const respuesta = await peticion(`/api/modificadores/${id}/desactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo desactivar el modificador'))
  return respuesta.json()
}

export async function reactivarModificador(id) {
  const respuesta = await peticion(`/api/modificadores/${id}/reactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo reactivar el modificador'))
  return respuesta.json()
}

export async function eliminarModificador(id) {
  const respuesta = await peticion(`/api/modificadores/${id}`, { metodo: 'DELETE' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo eliminar el modificador'))
}

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------

export async function obtenerCombos() {
  const respuesta = await peticion('/api/combos')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los combos'))
  return respuesta.json()
}

export async function crearCombo(payload) {
  const respuesta = await peticion('/api/combos', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo crear el combo'))
  return respuesta.json()
}

export async function actualizarCombo(id, payload) {
  const respuesta = await peticion(`/api/combos/${id}`, { metodo: 'PATCH', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo actualizar el combo'))
  return respuesta.json()
}

export async function desactivarCombo(id) {
  const respuesta = await peticion(`/api/combos/${id}/desactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo desactivar el combo'))
  return respuesta.json()
}

export async function reactivarCombo(id) {
  const respuesta = await peticion(`/api/combos/${id}/reactivar`, { metodo: 'PATCH' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo reactivar el combo'))
  return respuesta.json()
}

export async function eliminarCombo(id) {
  const respuesta = await peticion(`/api/combos/${id}`, { metodo: 'DELETE' })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo eliminar el combo'))
}
