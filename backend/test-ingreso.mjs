import { PrismaClient } from '@prisma/client'

const BASE = 'http://localhost:3001'
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./sec_test.db' } } })

async function test() {
  // login
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test6', contraseña: 'x' })
  });
  const loginData = await login.json();
  const token = loginData.token;
  const userId = loginData.usuario.id;
  console.log('Login response:', JSON.stringify(loginData));
  console.log('Token:', token ? 'OK' : 'FAIL');
  
  // cerrar caja si existe
  await fetch(BASE + '/api/caja/cerrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ efectivoContado: 0, usuarioId: userId })
  });
  
  // abrir caja
  const caja = await fetch(BASE + '/api/caja/abrir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ fondoInicial: 0, usuarioId: userId })
  });
  const cajaData = await caja.json();
  console.log('Caja:', caja.status, cajaData);
  
  // crear producto
  const prod = await prisma.producto.create({ data: { nombre: 'TestIng' + Date.now(), precio: 15, tipo: 'Reventa_directa' } });
  await prisma.movimiento_Inventario.create({ data: { productoId: prod.id, tipoMovimiento: 'Entrada', cantidad: 10 } });
  
  // crear pedido
  const pedido = await fetch(BASE + '/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({
      tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Test',
      productos: [{ productoId: prod.id, cantidad: 2 }],
      metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: userId,
      referenciaLibre: 'Calle 123'
    })
  });
  const pedidoData = await pedido.json();
  console.log('Pedido:', pedido.status, pedidoData.id);
  
  // pagar
  const pago = await fetch(BASE + '/api/pedidos/' + pedidoData.id + '/estado-pago', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ estadoPago: 'Pagado', usuarioId: userId })
  });
  const pagoData = await pago.json();
  console.log('Pago:', pago.status, pagoData.venta?.id);
  
  // cancelar
  const cancel = await fetch(BASE + '/api/pedidos/' + pedidoData.id + '/estado-preparacion', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ estadoPreparacion: 'Cancelado', regresaAInventario: false, devolverDinero: true, medioDevolucion: 'Efectivo_de_caja' })
  });
  const cancelData = await cancel.json();
  console.log('Cancel:', cancel.status, cancelData);
  
  // ingreso manual
  const ingreso = await fetch(BASE + '/api/ingresos-manuales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ monto: pedidoData.total, metodoPago: 'Efectivo', motivo: 'Test' })
  });
  const ingresoData = await ingreso.json();
  console.log('Ingreso:', ingreso.status, ingresoData);
  
  await prisma.$disconnect();
}
test().catch(console.error);