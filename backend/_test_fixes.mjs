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
  try { data = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, data }
}

const admin = await prisma.usuario.create({
  data: { tipo: 'Administrador', usuario: 'admin_fixes', contraseña: await bcrypt.hash('x', 10) },
})

async function loginAdmin() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_fixes', contraseña: 'x' }),
  })
  const data = await res.json()
  token = data.token
  return res.status
}

try {
  console.log('== Autenticación ==')
  ok((await loginAdmin()) === 200, 'login admin')

  console.log('== PROBLEMA 1: Reactivación de combos ==')

  const ingHarina = await prisma.ingrediente.create({
    data: { nombre: 'FixHarina', unidadMedida: 'kg', stockActual: 50, stockMinimoAlerta: 0 },
  })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingHarina.id, tipoMovimiento: 'Entrada', cantidad: 50 } })
  const p1 = await prisma.producto.create({ data: { nombre: 'FixP1', precio: 10, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: p1.id, ingredienteId: ingHarina.id, cantidad: 1 } })
  const p2 = await prisma.producto.create({ data: { nombre: 'FixP2', precio: 5, tipo: 'Reventa_directa' } })

  const comboDe = await prisma.combo.create({ data: { nombre: 'FixComboDesactivar', precioEspecial: 12, estado: 'Activo' } })
  await prisma.combo_Producto.create({ data: { comboId: comboDe.id, productoId: p1.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: comboDe.id, productoId: p2.id, cantidad: 1 } })

  // (1a) Desactivar p1 -> el combo activo debe quedar Suspendido.
  const desP1 = await req('PATCH', `/api/productos/${p1.id}/desactivar`)
  ok(desP1.status === 200, 'desactivar p1 -> 200')
  const comboTrasDes = await prisma.combo.findUnique({ where: { id: comboDe.id } })
  ok(comboTrasDes.estado === 'Suspendido', 'combo queda Suspendido al desactivar el producto')

  // (1b) Reactivar combo MANUALMENTE con el producto inactivo -> debe ser 409.
  const reactComboManual = await req('PATCH', `/api/combos/${comboDe.id}/reactivar`)
  ok(reactComboManual.status === 409, 'reactivar combo manualmente con producto inactivo -> 409')
  const comboTrasIntento = await prisma.combo.findUnique({ where: { id: comboDe.id } })
  ok(comboTrasIntento.estado === 'Suspendido', 'combo sigue Suspendido tras el 409')

  // (1c) Reactivar el producto -> el combo debe reactivarse AUTOMÁTICAMENTE.
  const reactP1 = await req('PATCH', `/api/productos/${p1.id}/reactivar`)
  ok(reactP1.status === 200, 'reactivar p1 -> 200')
  ok(
    reactP1.data.aviso && reactP1.data.aviso.combosReactivados.some((c) => c.id === comboDe.id),
    'respuesta de reactivar producto avisa el combo reactivado',
  )
  const comboTrasReac = await prisma.combo.findUnique({ where: { id: comboDe.id } })
  ok(comboTrasReac.estado === 'Activo', 'combo se reactiva AUTOMÁTICAMENTE al reactivar el producto')

  // (1d) Vía disponibilidad: p2 no disponible hoy -> combo suspendido -> 409 manual -> al volver disponible se auto-reactiva.
  const offDisp = await req('PATCH', `/api/productos/${p2.id}/disponibilidad`, { disponibleHoy: false })
  ok(offDisp.status === 200, 'marcar p2 no disponible hoy -> 200')
  const comboTrasDisp = await prisma.combo.findUnique({ where: { id: comboDe.id } })
  ok(comboTrasDisp.estado === 'Suspendido', 'combo suspendido al marcar p2 no disponible')
  const reactComboManual2 = await req('PATCH', `/api/combos/${comboDe.id}/reactivar`)
  ok(reactComboManual2.status === 409, 'reactivar combo manualmente con p2 no disponible -> 409')
  const onDisp = await req('PATCH', `/api/productos/${p2.id}/disponibilidad`, { disponibleHoy: true })
  ok(onDisp.status === 200, 'volver a marcar p2 disponible -> 200')
  ok(
    onDisp.data.aviso && onDisp.data.aviso.combosReactivados.some((c) => c.id === comboDe.id),
    'volver disponible reavisa combo reactivado',
  )
  const comboTrasDisp2 = await prisma.combo.findUnique({ where: { id: comboDe.id } })
  ok(comboTrasDisp2.estado === 'Activo', 'combo auto-reactivado al volver disponible el producto')

  // (1e) Casos compuestos: un combo con DOS productos, uno queda inactivo y otro no
  // disponible: ni reactivar uno solo basta -> el combo sigue suspendido.
  const p3 = await prisma.producto.create({ data: { nombre: 'FixP3', precio: 3, tipo: 'Reventa_directa' } })
  const comboDoble = await prisma.combo.create({ data: { nombre: 'FixComboDoble', precioEspecial: 20, estado: 'Activo' } })
  await prisma.combo_Producto.create({ data: { comboId: comboDoble.id, productoId: p1.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: comboDoble.id, productoId: p3.id, cantidad: 1 } })
  await req('PATCH', `/api/productos/${p1.id}/desactivar`)
  await req('PATCH', `/api/productos/${p3.id}/disponibilidad`, { disponibleHoy: false })
  const estado1 = (await prisma.combo.findUnique({ where: { id: comboDoble.id } })).estado
  ok(estado1 === 'Suspendido', 'combo doble suspendido con una causa activa (inactivo) + disponibleHoy false')
  await req('PATCH', `/api/productos/${p3.id}/disponibilidad`, { disponibleHoy: true })
  const estado2 = (await prisma.combo.findUnique({ where: { id: comboDoble.id } })).estado
  ok(estado2 === 'Suspendido', 'combo SIGUE suspendido al resolver solo una de las dos causas')
  await req('PATCH', `/api/productos/${p1.id}/reactivar`)
  const estado3 = (await prisma.combo.findUnique({ where: { id: comboDoble.id } })).estado
  ok(estado3 === 'Activo', 'combo se reactiva solo cuando YA NO queda ninguna causa')

  console.log(`\nResultado: ${fallas === 0 ? 'TODAS LAS PRUEBAS PASARON' : fallas + ' prueba(s) fallaron'}`)
} catch (e) {
  console.error('ERROR EN PRUEBA:', e)
  fallas++
} finally {
  await prisma.$transaction(async (tx) => {
    await tx.devolucion.deleteMany()
    await tx.venta_Producto_Modificador.deleteMany()
    await tx.venta_Producto_Mitad.deleteMany()
    await tx.venta_Producto.deleteMany()
    await tx.venta.deleteMany()
    await tx.movimiento_Inventario.deleteMany()
    await tx.pedido_Producto_Modificador.deleteMany()
    await tx.pedido_Producto_Mitad.deleteMany()
    await tx.pedido_Producto.deleteMany()
    await tx.pedido.deleteMany()
    await tx.combo_Producto.deleteMany()
    await tx.combo.deleteMany()
    await tx.producto_Modificador.deleteMany()
    await tx.modificador.deleteMany()
    await tx.producto_Ingrediente.deleteMany()
    await tx.producto.deleteMany()
    await tx.ingrediente.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.gasto.deleteMany()
    await tx.usuario.deleteMany()
  })
  await prisma.$disconnect()
}

process.exit(fallas === 0 ? 0 : 1)