const BASE = 'http://localhost:3001'

async function test() {
  // Clean and create admin
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin', contraseña: 'admin123' }),
  })
  const loginData = await loginRes.json()
  console.log('Login:', loginRes.status)
  const token = loginData.token
  
  // Create caja
  const cajaRes = await fetch(BASE + '/api/caja', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fondoInicial: 100 })
  })
  const cajaData = await cajaRes.json()
  console.log('Caja:', cajaData)
  
  // Create producto
  const prodRes = await fetch(BASE + '/api/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nombre: 'Coca', precio: 15, tipo: 'Reventa_directa' })
  })
  const prodData = await prodRes.json()
  console.log('Producto:', prodData)
  
  // Create venta
  const ventaRes = await fetch(BASE + '/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productos: [{ productoId: prodData.id, cantidad: 1 }], metodoPago: 'Tarjeta' })
  })
  const ventaData = await ventaRes.json()
  console.log('Venta:', JSON.stringify(ventaData, null, 2))
  
  // Create devolucion
  const devRes = await fetch(BASE + '/api/devoluciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ventaId: ventaData.venta.id, monto: 5, motivo: 'Otro', medioDevolucion: 'Efectivo', regresaAInventario: false })
  })
  const devData = await devRes.json()
  console.log('Devolucion:', JSON.stringify(devData, null, 2))
}

test().catch(console.error)