import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3001'

let fallas = 0
let token = null

function ok(cond, nombre) {
  if (cond) console.log(`  OK  ${nombre}`)
  else {
    fallas++
    console.log(`FALLA ${nombre}`)
  }
}

async function req(method, path, body) {
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {}
  return { status: res.status, data }
}

const admin = await prisma.usuario.create({
  data: {
    tipo: 'Administrador',
    nombre: null,
    usuario: 'admin_test',
    contraseña: await bcrypt.hash('x', 10),
  },
})

try {
  console.log('== Autenticación ==')
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test', contraseña: 'x' }),
  })
  const loginData = await loginRes.json()
  token = loginData.token
  ok(loginRes.status === 200 && !!token, 'login admin')

  console.log('== Health ==')
  const h = await req('GET', '/api/health')
  ok(h.status === 200 && h.data.status === 'ok', 'GET /api/health')

  console.log('== Ingrediente ==')
  const i1 = await req('POST', '/api/ingredientes', { nombre: 'Harina', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 2, costoUltimaCompra: 50, usuarioId: admin.id })
  ok(i1.status === 201, 'crear ingrediente con costo')
  const i2 = await req('POST', '/api/ingredientes', { nombre: 'Pan', unidadMedida: 'pieza', stockActual: 100, stockMinimoAlerta: 10 })
  ok(i2.status === 201, 'crear ingrediente sin costo')
  const i3 = await req('POST', '/api/ingredientes', { nombre: 'Mal', unidadMedida: 'litros', stockActual: 1, stockMinimoAlerta: 1 })
  ok(i3.status === 400, 'unidadMedida inválida -> 400')

  const movs = await prisma.movimiento_Inventario.count({ where: { ingredienteId: i1.data.id } })
  ok(movs === 1, 'movimiento Entrada inicial creado')
  const gastos = await prisma.gasto.count({ where: { usuarioId: admin.id, origen: 'Automatico_por_entrada_inventario' } })
  ok(gastos === 1, 'gasto automático creado por costo')
  const gasto = await prisma.gasto.findFirst({ where: { usuarioId: admin.id } })
  ok(gasto && gasto.categoria === 'Insumos' && gasto.monto === 50, 'gasto con categoria Insumos y monto correcto')

  const listI = await req('GET', '/api/ingredientes')
  ok(listI.status === 200 && Array.isArray(listI.data) && listI.data.length >= 2, 'listar ingredientes')

  const upI = await req('PATCH', `/api/ingredientes/${i2.data.id}`, { stockMinimoAlerta: 8 })
  ok(upI.status === 200 && upI.data.stockMinimoAlerta === 8, 'editar ingrediente')
  const upIbad = await req('PATCH', `/api/ingredientes/${i2.data.id}`, { stockActual: 5 })
  ok(upIbad.status === 400, 'rechaza editar stockActual directo')

  console.log('== Producto ==')
  const p1 = await req('POST', '/api/productos', {
    nombre: 'Torta',
    precio: 25,
    tipo: 'Con_receta',
    permiteMitadYMitad: true,
    ingredientes: [
      { ingredienteId: i1.data.id, cantidad: 0.5 },
      { ingredienteId: i2.data.id, cantidad: 2 },
    ],
  })
  ok(p1.status === 201 && p1.data.productoIngredientes.length === 2, 'crear producto con receta')
  const p2 = await req('POST', '/api/productos', { nombre: 'Coca', precio: 15, tipo: 'Reventa_directa' })
  ok(p2.status === 201, 'crear producto reventa directa')
  const p1bad = await req('POST', '/api/productos', { nombre: 'X', precio: 10, tipo: 'Con_receta', ingredientes: [] })
  ok(p1bad.status === 400, 'producto con receta sin ingredientes -> 400')
  const p2bad = await req('POST', '/api/productos', { nombre: 'Y', precio: 10, tipo: 'Reventa_directa', ingredientes: [{ ingredienteId: i1.data.id, cantidad: 1 }] })
  ok(p2bad.status === 400, 'reventa directa con receta -> 400')
  const p2bad2 = await req('POST', '/api/productos', { nombre: 'Z', precio: 10, tipo: 'Reventa_directa', permiteMitadYMitad: true })
  ok(p2bad2.status === 400, 'mitad y mitad en reventa directa -> 400')

  console.log('== Eliminar con registros ==')
  const delI = await req('DELETE', `/api/ingredientes/${i1.data.id}`)
  ok(delI.status === 409, 'no elimina ingrediente con recetas/movimientos')
  const delP1 = await req('DELETE', `/api/productos/${p1.data.id}`)
  ok(delP1.status === 204, 'elimina producto nunca vendido (con su receta propia)')
  const delP2 = await req('DELETE', `/api/productos/${p2.data.id}`)
  ok(delP2.status === 204, 'elimina producto reventa nunca vendido')

  console.log('== Nombres únicos (case-insensitive) ==')
  const dupIng = await req('POST', '/api/ingredientes', { nombre: 'HARINA', unidadMedida: 'kg', stockActual: 1, stockMinimoAlerta: 1 })
  ok(dupIng.status === 400 && /Harina/.test(dupIng.data.message || ''), 'ingrediente duplicado -> 400')
  const editDup = await req('PATCH', `/api/ingredientes/${i1.data.id}`, { nombre: 'pan' })
  ok(editDup.status === 400, 'editar hacia un nombre existente -> 400')
  const editSelf = await req('PATCH', `/api/ingredientes/${i1.data.id}`, { nombre: 'Harina' })
  ok(editSelf.status === 200, 'conservar el mismo nombre al editar -> 200')

  console.log('== Desactivar ingrediente (decisión por producto) ==')
  const p3 = await req('POST', '/api/productos', {
    nombre: 'Sandwich',
    precio: 18,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: i2.data.id, cantidad: 1 }],
  })
  ok(p3.status === 201, 'crear producto para probar desactivación')
  const dupProd = await req('POST', '/api/productos', { nombre: 'sandwich', precio: 5, tipo: 'Reventa_directa' })
  ok(dupProd.status === 400, 'producto duplicado -> 400')
  const desSin = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, {})
  ok(desSin.status === 409 && desSin.data.requiereConfirmacion === true && desSin.data.productosAfectados.some((p) => p.id === p3.data.id), 'desactivar pide confirmación y lista afectados')
  const desVacia = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, { decisiones: [] })
  ok(desVacia.status === 400, 'decisiones vacías -> 400')
  const desFalta = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, { decisiones: [{ productoId: 99999, accion: 'suspender' }] })
  ok(desFalta.status === 400, 'faltan decisiones para algún producto afectado -> 400')
  const desVende = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, {
    decisiones: [{ productoId: p3.data.id, accion: 'vender_sin_el' }],
  })
  ok(desVende.status === 200 && desVende.data.ingrediente?.estado === 'Inactivo', 'vender_sin_el desactiva el ingrediente')
  const recetaTras = await prisma.producto_Ingrediente.count({ where: { productoId: p3.data.id, ingredienteId: i2.data.id } })
  ok(recetaTras === 0, 'ingrediente removido de la receta al vender sin él')
  const p3Disp = await prisma.producto.findUnique({ where: { id: p3.data.id } })
  ok(p3Disp.disponibleHoy === true, 'producto vendido sin el ingrediente siguió disponible')

  console.log('== Desactivar con suspensión por producto y combos ==')
  const iSusp = await req('POST', '/api/ingredientes', { nombre: 'Queso', unidadMedida: 'pieza', stockActual: 20, stockMinimoAlerta: 2 })
  ok(iSusp.status === 201, 'crear ingrediente para prueba de suspensión')
  const pSusp = await req('POST', '/api/productos', {
    nombre: 'Quesadilla',
    precio: 30,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: iSusp.data.id, cantidad: 1 }],
  })
  ok(pSusp.status === 201, 'crear producto que se suspenderá')
  const cSusp = await req('POST', '/api/combos', {
    nombre: 'Combo Quesadilla',
    precioEspecial: 25,
    productos: [{ productoId: pSusp.data.id, cantidad: 1 }],
  })
  ok(cSusp.status === 201 && cSusp.data.estado === 'Activo', 'combo activo con producto disponible')
  const desSuspende = await req('PATCH', `/api/ingredientes/${iSusp.data.id}/desactivar`, {
    decisiones: [{ productoId: pSusp.data.id, accion: 'suspender' }],
  })
  ok(desSuspende.status === 200 && desSuspende.data.ingrediente?.estado === 'Inactivo', 'suspender desactiva el ingrediente')
  ok(desSuspende.data.aviso && desSuspende.data.aviso.combosSuspendidos.some((c) => c.id === cSusp.data.id), 'suspende los combos afectados y avisa')
  const pSuspEstado = await prisma.producto.findUnique({ where: { id: pSusp.data.id } })
  ok(pSuspEstado.disponibleHoy === false, 'producto suspendido quedó no disponible hoy')
  const recetaSusp = await prisma.producto_Ingrediente.count({ where: { productoId: pSusp.data.id, ingredienteId: iSusp.data.id } })
  ok(recetaSusp === 1, 'la receta conserva el ingrediente al suspender el producto')

  const iMix = await req('POST', '/api/ingredientes', { nombre: 'Mayonesa', unidadMedida: 'g', stockActual: 100, stockMinimoAlerta: 10 })
  const pMix1 = await req('POST', '/api/productos', {
    nombre: 'Baguette',
    precio: 22,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: iMix.data.id, cantidad: 1 }],
  })
  const pMix2 = await req('POST', '/api/productos', {
    nombre: 'Wrap',
    precio: 24,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: iMix.data.id, cantidad: 1 }],
  })
  const desMixta = await req('PATCH', `/api/ingredientes/${iMix.data.id}/desactivar`, {
    decisiones: [
      { productoId: pMix1.data.id, accion: 'vender_sin_el' },
      { productoId: pMix2.data.id, accion: 'suspender' },
    ],
  })
  ok(desMixta.status === 200, 'decisiones distintas por producto en la misma acción')
  const recetaMix = await prisma.producto_Ingrediente.count({ where: { productoId: pMix1.data.id, ingredienteId: iMix.data.id } })
  const dispMix = await prisma.producto.findUnique({ where: { id: pMix2.data.id } })
  ok(recetaMix === 0 && dispMix.disponibleHoy === false, 'mezcla de acciones respetada por producto')

  console.log('== Bloquear disponibilidad/reactivación con ingrediente inactivo ==')
  const pRecetaInact = await req('POST', '/api/productos', {
    nombre: 'Panera',
    precio: 20,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: i2.data.id, cantidad: 1 }],
  })
  ok(pRecetaInact.status === 201, 'crear producto con ingrediente inactivo en la receta')
  const disOffInact = await req('PATCH', `/api/productos/${pRecetaInact.data.id}/disponibilidad`, { disponibleHoy: false })
  ok(disOffInact.status === 200, 'disponible_hoy=false con ingrediente inactivo permitido')
  const disOnInact = await req('PATCH', `/api/productos/${pRecetaInact.data.id}/disponibilidad`, { disponibleHoy: true })
  ok(disOnInact.status === 409 && /Pan/.test(disOnInact.data.message || ''), 'disponible_hoy=true bloqueado si la receta tiene un ingrediente inactivo')
  const pRecetaInactDisp = await prisma.producto.findUnique({ where: { id: pRecetaInact.data.id } })
  ok(pRecetaInactDisp.disponibleHoy === false, 'el producto quedó no disponible tras el bloqueo')
  const reactInactProd = await req('PATCH', `/api/productos/${pRecetaInact.data.id}/desactivar`, {})
  ok(reactInactProd.status === 200, 'desactivar el producto con ingrediente inactivo permitido')
  const reactInact = await req('PATCH', `/api/productos/${pRecetaInact.data.id}/reactivar`, {})
  ok(reactInact.status === 409 && /Pan/.test(reactInact.data.message || ''), 'reactivar bloqueado con ingrediente inactivo')
  const reactIng = await req('PATCH', `/api/ingredientes/${i2.data.id}/reactivar`, {})
  ok(reactIng.status === 200, 'reactivar el ingrediente inactivo')
  const reactOk = await req('PATCH', `/api/productos/${pRecetaInact.data.id}/reactivar`, {})
  ok(reactOk.status === 200 && reactOk.data.producto.estado === 'Activo', 'reactivar el producto al completarse la receta')
  const disOnOk = await req('PATCH', `/api/productos/${pRecetaInact.data.id}/disponibilidad`, { disponibleHoy: true })
  ok(disOnOk.status === 200, 'disponible_hoy=true permitido con receta completa')

  console.log('== Modificador ==')
  const pMod = await req('POST', '/api/productos', {
    nombre: 'Tarta',
    precio: 26,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: i1.data.id, cantidad: 1 }],
  })
  ok(pMod.status === 201, 'crear producto para probar modificadores')
  const mBadProd = await req('POST', '/api/modificadores', {
    nombre: 'Sin harina en sandwich',
    tipo: 'Quitar',
    ingredienteAfectadoId: i1.data.id,
    productoIds: [p3.data.id],
  })
  ok(mBadProd.status === 400, 'rechaza asociar producto que no incluye el ingrediente afectado')
  const m1 = await req('POST', '/api/modificadores', {
    nombre: 'Sin harina',
    tipo: 'Quitar',
    ingredienteAfectadoId: i1.data.id,
    productoIds: [pMod.data.id],
  })
  ok(m1.status === 201, 'crear modificador asociado a producto')
  const mBad = await req('POST', '/api/modificadores', { nombre: 'M', tipo: 'Sustituir', ingredienteAfectadoId: i1.data.id })
  ok(mBad.status === 400, 'Sustituir sin ingredienteSustitutoId -> 400')
  const m2 = await req('POST', '/api/modificadores', {
    nombre: 'Extra',
    tipo: 'Agregar',
    ingredienteAfectadoId: i1.data.id,
    cantidadExtra: 0.2,
    costoAdicional: 3,
  })
  ok(m2.status === 201, 'crear modificador sin asociación previa')
  const asoc = await req('POST', `/api/productos/${pMod.data.id}/modificadores`, { modificadorId: m2.data.id })
  ok(asoc.status === 201, 'asociar modificador a producto compatible')
  const asocNoCompat = await req('POST', `/api/productos/${p3.data.id}/modificadores`, { modificadorId: m2.data.id })
  ok(asocNoCompat.status === 400, 'no asocia modificador a producto sin el ingrediente afectado')
  const asocDup = await req('POST', `/api/productos/${pMod.data.id}/modificadores`, { modificadorId: m2.data.id })
  ok(asocDup.status === 409, 'asociar duplicado -> 409')
  const desasoc = await req('DELETE', `/api/productos/${pMod.data.id}/modificadores/${m2.data.id}`)
  ok(desasoc.status === 204, 'desasociar modificador')
  const listM = await req('GET', '/api/modificadores')
  ok(listM.status === 200 && listM.data.some((m) => m.id === m1.data.id), 'listar modificadores')

  console.log('== Sustituir: cantidad del sustituto ==')
  const mSubSinCant = await req('POST', '/api/modificadores', {
    nombre: 'Sustituto sin cantidad',
    tipo: 'Sustituir',
    ingredienteAfectadoId: i1.data.id,
    ingredienteSustitutoId: i2.data.id,
  })
  ok(mSubSinCant.status === 400, 'Sustituir sin cantidadSustituto -> 400')
  ok(/cantidadSustituto/i.test(mSubSinCant.data?.message || ''), 'mensaje exige cantidadSustituto')

  // Unidades DISTINTAS: valor en kg vs valor en pieza -> checkbox no disponible,
  // por lo que la cantidad se indica manualmente y el backend la debe guardar.
  const iKg = await req('POST', '/api/ingredientes', { nombre: 'Azúcar', unidadMedida: 'kg', stockActual: 5, stockMinimoAlerta: 1 })
  const iPza = await req('POST', '/api/ingredientes', { nombre: 'Sobre azúcar', unidadMedida: 'pieza', stockActual: 50, stockMinimoAlerta: 5 })
  ok(iKg.status === 201 && iPza.status === 201, 'crear ingredientes con unidades distintas (kg y pieza)')
  ok(iKg.data.unidadMedida !== iPza.data.unidadMedida, 'unidades son distintas (kg vs pieza)')
  const mSubDist = await req('POST', '/api/modificadores', {
    nombre: 'Azúcar en polvo',
    tipo: 'Sustituir',
    ingredienteAfectadoId: iKg.data.id,
    ingredienteSustitutoId: iPza.data.id,
    cantidadSustituto: 2,
  })
  ok(mSubDist.status === 201 && mSubDist.data.cantidadSustituto === 2, 'Sustituir con unidades distintas creado con cantidad manual 2')
  ok(mSubDist.data.ingredienteAfectado.unidadMedida !== mSubDist.data.ingredienteSustituto.unidadMedida, 'respuesta conserva unidades distintas del chequeo del checkbox')

  // Unidades IGUALES: el checkbox "usar la misma cantidad" SÍ está disponible.
  const iIgualA = await req('POST', '/api/ingredientes', { nombre: 'Miel', unidadMedida: 'g', stockActual: 1000, stockMinimoAlerta: 100 })
  const iIgualB = await req('POST', '/api/ingredientes', { nombre: 'Azúcar glass', unidadMedida: 'g', stockActual: 1000, stockMinimoAlerta: 100 })
  ok(iIgualA.status === 201 && iIgualB.status === 201, 'crear ingredientes con unidades iguales (g y g)')
  ok(iIgualA.data.unidadMedida === iIgualB.data.unidadMedida, 'unidades son iguales (g == g)')
  const mSubIgual = await req('POST', '/api/modificadores', {
    nombre: 'Miel por azúcar glass',
    tipo: 'Sustituir',
    ingredienteAfectadoId: iIgualA.data.id,
    ingredienteSustitutoId: iIgualB.data.id,
    cantidadSustituto: 1.5,
  })
  ok(mSubIgual.status === 201 && mSubIgual.data.cantidadSustituto === 1.5, 'Sustituir con unidades iguales creado (checkbox disponible)')
  ok(mSubIgual.data.ingredienteAfectado.unidadMedida === mSubIgual.data.ingredienteSustituto.unidadMedida, 'respuesta conserva unidades iguales del chequeo del checkbox')

  console.log('== Combo ==')
  const c1 = await req('POST', '/api/combos', {
    nombre: 'Combo Torta',
    precioEspecial: 20,
    productos: [{ productoId: p3.data.id, cantidad: 1 }],
  })
  ok(c1.status === 201 && c1.data.estado === 'Activo', 'crear combo activo')

  const pNoDisp = await req('POST', '/api/productos', {
    nombre: 'Agua',
    precio: 10,
    tipo: 'Con_receta',
    disponibleHoy: false,
    ingredientes: [{ ingredienteId: i1.data.id, cantidad: 1 }],
  })
  const c2 = await req('POST', '/api/combos', {
    nombre: 'Combo Agua',
    precioEspecial: 8,
    productos: [{ productoId: pNoDisp.data.id, cantidad: 1 }],
  })
  ok(c2.status === 201 && c2.data.estado === 'Suspendido' && c2.data.aviso, 'combo con producto no disponible -> Suspendido con aviso')

  console.log('== Suspensión automática por disponible_hoy ==')
  const p5 = await req('POST', '/api/productos', {
    nombre: 'Papa',
    precio: 12,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: i1.data.id, cantidad: 1 }],
  })
  const c3 = await req('POST', '/api/combos', {
    nombre: 'Combo Papa',
    precioEspecial: 10,
    productos: [{ productoId: p5.data.id, cantidad: 1 }],
  })
  ok(c3.status === 201 && c3.data.estado === 'Activo', 'combo activo con producto disponible')
  const disNo = await req('PATCH', `/api/productos/${p5.data.id}/disponibilidad`, { disponibleHoy: false })
  ok(disNo.status === 200 && disNo.data.aviso && disNo.data.aviso.combosSuspendidos.some((c) => c.id === c3.data.id), 'disponible_hoy=false suspende combo con aviso')
  const estadoC3 = await prisma.combo.findUnique({ where: { id: c3.data.id } })
  ok(estadoC3.estado === 'Suspendido', 'combo en BD quedó Suspendido')
  const disSi = await req('PATCH', `/api/productos/${p5.data.id}/disponibilidad`, { disponibleHoy: true })
  ok(
    disSi.status === 200 && disSi.data.aviso && disSi.data.aviso.combosReactivados.some((c) => c.id === c3.data.id),
    'volver a disponible_hoy=true reactiva el combo con aviso',
  )
  const estadoC3b = await prisma.combo.findUnique({ where: { id: c3.data.id } })
  ok(estadoC3b.estado === 'Activo', 'combo se reactiva AUTOMÁTICAMENTE al volver disponible su producto')
  const reactC3 = await req('PATCH', `/api/combos/${c3.data.id}/reactivar`, {})
  ok(reactC3.status === 400, 'reactivar combo ya Activo -> 400')
  // Con producto aún no disponible, reactivar debe rechazar (409).
  const disNo2 = await req('PATCH', `/api/productos/${p5.data.id}/disponibilidad`, { disponibleHoy: false })
  const reactC3Bloqueado = await req('PATCH', `/api/combos/${c3.data.id}/reactivar`, {})
  ok(reactC3Bloqueado.status === 409, 'reactivar combo con producto no disponible -> 409')
  const disSi2 = await req('PATCH', `/api/productos/${p5.data.id}/disponibilidad`, { disponibleHoy: true })

  console.log('== Desactivar producto en combo ==')
  const p6 = await req('POST', '/api/productos', {
    nombre: 'Jugo',
    precio: 14,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: i1.data.id, cantidad: 1 }],
  })
  const c4 = await req('POST', '/api/combos', {
    nombre: 'Combo Jugo',
    precioEspecial: 11,
    productos: [{ productoId: p6.data.id, cantidad: 1 }],
  })
  const desP = await req('PATCH', `/api/productos/${p6.data.id}/desactivar`, {})
  ok(desP.status === 200 && desP.data.aviso && desP.data.aviso.combosSuspendidos.some((c) => c.id === c4.data.id), 'desactivar producto suspende combos y avisa')

  console.log('== Cambio de precio en combo activo ==')
  const upPrecio = await req('PATCH', `/api/productos/${p3.data.id}`, { precio: 30 })
  ok(upPrecio.status === 200 && upPrecio.data.aviso && upPrecio.data.aviso.combos.some((c) => c.id === c1.data.id), 'cambio de precio en combo activo genera aviso informativo')

  console.log('== Eliminar combo ==')
  const delC2 = await req('DELETE', `/api/combos/${c2.data.id}`)
  ok(delC2.status === 204, 'eliminar combo nunca vendido')
  const delC1 = await req('DELETE', `/api/combos/${c1.data.id}`)
  ok(delC1.status === 204, 'eliminar combo nunca vendido (2)')
  const desactivarCombo = await req('PATCH', `/api/combos/${c4.data.id}/desactivar`, {})
  ok(desactivarCombo.status === 200 && desactivarCombo.data.estado === 'Inactivo', 'desactivar combo')

  console.log(`\nResultado: ${fallas === 0 ? 'TODAS LAS PRUEBAS PASARON' : fallas + ' prueba(s) fallaron'}`)
} catch (e) {
  console.error('ERROR EN PRUEBA:', e)
  fallas++
} finally {
  await prisma.$transaction(async (tx) => {
    await tx.venta_Producto_Modificador.deleteMany()
    await tx.venta_Producto_Mitad.deleteMany()
    await tx.venta_Producto.deleteMany()
    await tx.devolucion.deleteMany()
    await tx.venta.deleteMany()
    await tx.gasto.deleteMany()
    await tx.combo_Producto.deleteMany()
    await tx.combo.deleteMany()
    await tx.producto_Modificador.deleteMany()
    await tx.producto_Ingrediente.deleteMany()
    await tx.modificador.deleteMany()
    await tx.producto.deleteMany()
    await tx.movimiento_Inventario.deleteMany()
    await tx.ingrediente.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.pedido.deleteMany()
    await tx.empleado.deleteMany()
    await tx.cliente_Referencia.deleteMany()
    await tx.cliente.deleteMany()
    await tx.usuario.deleteMany()
  })
  await prisma.$disconnect()
}

process.exit(fallas === 0 ? 0 : 1)