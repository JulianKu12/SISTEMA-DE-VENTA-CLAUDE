import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasources: { db: { url: 'file:./sec_test.db' } } })
const BASE = 'http://localhost:3001'

async function req(method, path, body, token) {
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

async function stockProducto(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: id } })
  return agg._sum.cantidad ?? 0
}

async function getMovements(productoId) {
  return prisma.movimiento_Inventario.findMany({
    where: { productoId },
    orderBy: { id: 'asc' }
  })
}

async function test() {
  // Clean up first - correct order to avoid FK constraints
  await prisma.movimiento_Inventario.deleteMany()
  await prisma.pedido_Producto_Modificador.deleteMany()
  await prisma.pedido_Producto_Mitad.deleteMany()
  await prisma.pedido_Producto.deleteMany()
  await prisma.venta_Producto_Modificador.deleteMany()
  await prisma.venta_Producto_Mitad.deleteMany()
  await prisma.venta_Producto.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.devolucion.deleteMany()
  await prisma.venta.deleteMany()
  await prisma.combo_Producto.deleteMany()
  await prisma.combo.deleteMany()
  await prisma.producto_Modificador.deleteMany()
  await prisma.modificador.deleteMany()
  await prisma.producto_Ingrediente.deleteMany()
  await prisma.producto.deleteMany()
  await prisma.ingrediente.deleteMany()
  await prisma.gasto.deleteMany()
  await prisma.dia_Operativo.deleteMany()
  await prisma.configuracion.deleteMany()
  await prisma.cliente_Referencia.deleteMany()
  await prisma.cliente.deleteMany()
  await prisma.empleado.deleteMany()
  await prisma.usuario.deleteMany({ where: { NOT: { usuario: 'admin_test6' } } })
  
  // Setup
  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin_test6' },
    update: {},
    create: { tipo: 'Administrador', usuario: 'admin_test6', contraseña: '$2b$10$test' },
  })
  
  // Login
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test6', contraseña: 'x' }),
  })
  const loginData = await loginRes.json()
  const token = loginData.token
  
  const harina = await prisma.ingrediente.create({
    data: { nombre: 'Harina6', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 2 },
  })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  
  const torta = await prisma.producto.create({ data: { nombre: 'Torta6', precio: 25, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: harina.id, cantidad: 2 } })
  
  const coca = await prisma.producto.create({ data: { nombre: 'Coca6', precio: 15, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  
  console.log('Initial coca stock:', await stockProducto(coca.id))
  
  // Simulate the test sequence up to combo
  // p1: Mostrador+Para_recoger, 2 coca, Pagado
  const p1 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Mostrador',
    clienteId: null,
    nombreClienteLibre: 'Cliente X',
    productos: [{ productoId: coca.id, cantidad: 2 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 50,
    usuarioId: admin.id,
  }, token)
  console.log('p1 status:', p1.status)
  console.log('After p1:', await stockProducto(coca.id))
  const movs1 = await getMovements(coca.id)
  console.log('Movements after p1:', movs1.map(m => ({ tipo: m.tipoMovimiento, cantidad: m.cantidad, ref: m.referenciaId, ppId: m.pedidoProductoId })))
  
  // p2: Mostrador+A_domicilio, 1 coca, Pendiente_pago
  const p2 = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio',
    origen: 'Mostrador',
    clienteId: null,
    nombreClienteLibre: 'María',
    referenciaLibre: 'calle falsa 123, junto al parque',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 100,
    usuarioId: admin.id,
  }, token)
  console.log('p2 status:', p2.status)
  console.log('After p2:', await stockProducto(coca.id))
  const movs2 = await getMovements(coca.id)
  console.log('Movements after p2:', movs2.map(m => ({ tipo: m.tipoMovimiento, cantidad: m.cantidad, ref: m.referenciaId, ppId: m.pedidoProductoId })))
  
  // p3: Telefono+Para_recoger, 1 coca, Pendiente_pago
  const p3 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Telefono',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 100,
    usuarioId: admin.id,
  }, token)
  console.log('p3 status:', p3.status)
  console.log('After p3:', await stockProducto(coca.id))
  
  // p4: Telefono+A_domicilio, 1 coca, Pendiente_pago
  const p4 = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio',
    origen: 'Telefono',
    nombreClienteLibre: 'Luis',
    referenciaLibre: 'Av. Siempre Viva 742',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Transferencia',
    usuarioId: admin.id,
  }, token)
  console.log('p4 status:', p4.status)
  console.log('After p4:', await stockProducto(coca.id))
  
  // pAviso: A_domicilio, 1 coca, then cancelled WITHOUT return
  const empAviso = await req('POST', '/api/empleados', { nombre: 'PedroAviso', usuario: 'pedroaviso', contraseña: 'pass123' }, token)
  const pAviso = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'AvisoCancel',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
    referenciaLibre: 'Calle falsa 123',
  }, token)
  console.log('pAviso status:', pAviso.status)
  console.log('After pAviso:', await stockProducto(coca.id))
  
  const cancelConAviso = await req('PATCH', `/api/pedidos/${pAviso.data.id}/estado-preparacion`, { 
    estadoPreparacion: 'Cancelado', regresaAInventario: false, avisoConfirmado: true 
  }, token)
  console.log('pAviso cancel status:', cancelConAviso.status)
  console.log('After pAviso cancel (no return):', await stockProducto(coca.id))
  
  // p1 cancelled WITH return
  const cancelar1 = await req('PATCH', `/api/pedidos/${p1.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado',
    regresaAInventario: true,
  }, token)
  console.log('p1 cancel status:', cancelar1.status)
  console.log('After p1 cancel with return:', await stockProducto(coca.id))
  const movsAfterCancel = await getMovements(coca.id)
  console.log('Movements after p1 cancel:', movsAfterCancel.map(m => ({ tipo: m.tipoMovimiento, cantidad: m.cantidad, ref: m.referenciaId, ppId: m.pedidoProductoId })))
  
  // p2 paid
  const pagar2 = await req('PATCH', `/api/pedidos/${p2.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id }, token)
  console.log('p2 pay status:', pagar2.status)
  console.log('After p2 paid:', await stockProducto(coca.id))
  
  // NOW CREATE COMBO
  const combo = await prisma.combo.create({ data: { nombre: 'Combo Pedido', precioEspecial: 35 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: torta.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: coca.id, cantidad: 1 } })
  
  console.log('\n--- Creating combo pedido ---')
  console.log('Stock before combo:', await stockProducto(coca.id))
  
  const pCombo = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Mostrador',
    nombreClienteLibre: 'ComboX',
    productos: [{ comboId: combo.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 50,
    usuarioId: admin.id,
  }, token)
  console.log('pCombo status:', pCombo.status)
  console.log('Stock after combo:', await stockProducto(coca.id))
  
  const movsAfterCombo = await getMovements(coca.id)
  console.log('Movements after combo:', movsAfterCombo.map(m => ({ tipo: m.tipoMovimiento, cantidad: m.cantidad, ref: m.referenciaId, ppId: m.pedidoProductoId, ventaPpId: m.ventaProductoId })))
  
  // Check pedido_Producto for the combo
  const ppCombo = await prisma.pedido_Producto.findMany({ where: { pedidoId: pCombo.data.id } })
  console.log('Pedido_Producto for combo:', ppCombo.map(p => ({ productoId: p.productoId, cantidad: p.cantidad, comboId: p.comboId })))
  
  // Check venta_Producto for the combo
  if (pCombo.data.venta) {
    const vpCombo = await prisma.venta_Producto.findMany({ where: { ventaId: pCombo.data.venta.id } })
    console.log('Venta_Producto for combo:', vpCombo.map(p => ({ productoId: p.productoId, cantidad: p.cantidad, comboId: p.comboId })))
  }
  
  console.log('\nExpected: 5, Actual:', await stockProducto(coca.id))
}

test().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect() })