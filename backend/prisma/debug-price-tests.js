import { createTestPrisma } from './require-test-db.js'
import bcrypt from 'bcrypt'

const prisma = createTestPrisma()
const BASE = 'http://localhost:3001'

async function main() {
  // Clean
  await prisma.usuario.deleteMany({ where: { usuario: { startsWith: 'admin_test' } } })
  await prisma.configuracion.upsert({
    where: { id: 1 },
    create: { id: 1, costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] },
    update: { costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] }
  })
  
  // Create admin
  const admin = await prisma.usuario.create({
    data: { tipo: 'Administrador', usuario: 'admin_test3', contraseña: await bcrypt.hash('x', 10) }
  })
  console.log('Created admin:', admin.id)
  
  // Login
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test3', contraseña: 'x' })
  })
  const loginData = await loginRes.json()
  console.log('Login:', loginRes.status, loginData)
  const token = loginData.token
  
  // Create ingredients
  const harina = await prisma.ingrediente.create({ data: { nombre: 'Harina', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 10 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const masa = await prisma.ingrediente.create({ data: { nombre: 'Masa', unidadMedida: 'pieza', stockActual: 100, stockMinimoAlerta: 10 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: masa.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  
  // Create productos
  const torta = await prisma.producto.create({ data: { nombre: 'Torta', precio: 25, tipo: 'Con_receta', permiteMitadYMitad: true } })
  await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: harina.id, cantidad: 2 } })
  await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: masa.id, cantidad: 1 } })
  
  const sabor1 = await prisma.producto.create({ data: { nombre: 'Chocolate', precio: 45, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: sabor1.id, ingredienteId: harina.id, cantidad: 4 } })
  const sabor2 = await prisma.producto.create({ data: { nombre: 'Fresa', precio: 40, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: sabor2.id, ingredienteId: harina.id, cantidad: 2 } })
  
  // Create caja
  const dia = await prisma.dia_Operativo.create({ data: { fondoInicial: 100, estado: 'Abierto', usuarioId: admin.id } })
  
  // Test 1: precio manipulado en venta directa
  console.log('\n=== Test 1: venta directa con precioCongelado:0.01 ===')
  const v1 = await fetch(BASE + '/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productos: [{ productoId: torta.id, cantidad: 1, precioCongelado: 0.01 }], metodoPago: 'Efectivo' })
  })
  const v1Data = await v1.json()
  console.log('Status:', v1.status)
  console.log('Response:', JSON.stringify(v1Data, null, 2))
  
  // Test 2: precio manipulado en pedido + pago
  console.log('\n=== Test 2: pedido con precioCongelado:0.01 + pago ===')
  const p1 = await fetch(BASE + '/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tipo: 'Para_recoger', origen: 'Mostrador', productos: [{ productoId: torta.id, cantidad: 1, precioCongelado: 0.01 }], metodoPago: 'Efectivo', montoReferenciaPago: 50 })
  })
  const p1Data = await p1.json()
  console.log('Pedido status:', p1.status, 'total:', p1Data.total)
  
  if (p1Data.id) {
    const pago = await fetch(BASE + `/api/pedidos/${p1Data.id}/estado-pago`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estadoPago: 'Pagado' })
    })
    const pagoData = await pago.json()
    console.log('Pago status:', pago.status)
    console.log('Response:', JSON.stringify(pagoData, null, 2))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())