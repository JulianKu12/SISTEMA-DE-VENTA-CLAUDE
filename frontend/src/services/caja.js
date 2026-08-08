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

export async function obtenerEstadoCaja() {
  const respuesta = await peticion('/api/caja/estado')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo consultar la caja'))
  return respuesta.json()
}

export async function abrirCaja(payload) {
  const respuesta = await peticion('/api/caja/abrir', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo abrir la caja'))
  return respuesta.json()
}

export async function cerrarCaja(payload) {
  const respuesta = await peticion('/api/caja/cerrar', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo cerrar la caja'))
  return respuesta.json()
}

export async function obtenerHistorialCaja() {
  const respuesta = await peticion('/api/caja/historial')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo cargar el historial de cortes'))
  return respuesta.json()
}

export async function listarGastos() {
  const respuesta = await peticion('/api/gastos')
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar los gastos'))
  return respuesta.json()
}

export async function crearGasto(payload) {
  const respuesta = await peticion('/api/gastos', { metodo: 'POST', body: payload })
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudo registrar el gasto'))
  return respuesta.json()
}

export async function obtenerVentas(diaOperativoId) {
  const respuesta = await peticion(`/api/ventas?diaOperativoId=${diaOperativoId}`)
  if (!respuesta.ok) throw new Error(await extraerMensaje(respuesta, 'No se pudieron cargar las ventas'))
  return respuesta.json()
}