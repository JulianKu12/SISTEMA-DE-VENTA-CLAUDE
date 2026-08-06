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

  console.log('== Desactivar ingrediente ==')
  const p3 = await req('POST', '/api/productos', {
    nombre: 'Sandwich',
    precio: 18,
    tipo: 'Con_receta',
    ingredientes: [{ ingredienteId: i2.data.id, cantidad: 1 }],
  })
  ok(p3.status === 201, 'crear producto para probar desactivación')
  const desSin = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, {})
  ok(desSin.status === 409 && desSin.data.requiereConfirmacion === true && desSin.data.productosAfectados.some((p) => p.id === p3.data.id), 'desactivar pide confirmación y lista afectados')
  const desCancela = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, { opcion: 'cancelar' })
  ok(desCancela.status === 200 && desCancela.data.ingrediente.estado === 'Activo', 'opcion cancelar no desactiva')
  const desVende = await req('PATCH', `/api/ingredientes/${i2.data.id}/desactivar`, { opcion: 'vender_sin_el' })
  ok(desVende.status === 200 && desVende.data.ingrediente?.estado === 'Inactivo', 'opcion vender_sin_el desactiva')
  const recetaTras = await prisma.producto_Ingrediente.count({ where: { productoId: p3.data.id, ingredienteId: i2.data.id } })
  ok(recetaTras === 0, 'ingrediente removido de la receta')

  console.log('== Modificador ==')
  const m1 = await req('POST', '/api/modificadores', {
    nombre: 'Sin harina',
    tipo: 'Quitar',
    ingredienteAfectadoId: i1.data.id,
    productoIds: [p3.data.id],
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
  const asoc = await req('POST', `/api/productos/${p3.data.id}/modificadores`, { modificadorId: m2.data.id })
  ok(asoc.status === 201, 'asociar modificador a producto')
  const asocDup = await req('POST', `/api/productos/${p3.data.id}/modificadores`, { modificadorId: m2.data.id })
  ok(asocDup.status === 409, 'asociar duplicado -> 409')
  const desasoc = await req('DELETE', `/api/productos/${p3.data.id}/modificadores/${m2.data.id}`)
  ok(desasoc.status === 204, 'desasociar modificador')
  const listM = await req('GET', '/api/modificadores')
  ok(listM.status === 200 && listM.data.some((m) => m.id === m1.data.id), 'listar modificadores')

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
  ok(disSi.status === 200 && !disSi.data.aviso, 'volver a disponible_hoy=true sin aviso')

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
    await tx.venta.deleteMany()
    await tx.devolucion.deleteMany()
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