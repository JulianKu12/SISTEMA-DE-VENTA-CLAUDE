const BASE = 'http://localhost:3001'

async function test() {
  // Login as admin_test4
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test4', contraseña: 'x' }),
  })
  const loginData = await loginRes.json()
  console.log('Login:', loginRes.status, loginData)
  const token = loginData.token
  
  // Get admin user id
  const adminRes = await fetch(BASE + '/api/usuarios', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const adminData = await adminRes.json()
  console.log('Admin:', adminData)
  
  // Create ingrediente
  const harinaRes = await fetch(BASE + '/api/ingredientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nombre: 'Harina', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 2 })
  })
  const harinaData = await harinaRes.json()
  console.log('Harina:', harinaData)
  
  // Create producto
  const tortaRes = await fetch(BASE + '/api/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nombre: 'Torta', precio: 25, tipo: 'Con_receta', permiteMitadYMitad: true })
  })
  const tortaData = await tortaRes.json()
  console.log('Torta:', tortaData)
  
  // Create receta
  const recetaRes = await fetch(BASE + `/api/productos/${tortaData.id}/ingredientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ingredienteId: harinaData.id, cantidad: 2 })
  })
  const recetaData = await recetaRes.json()
  console.log('Receta:', recetaData)
  
  // Create dia operativo
  const diaRes = await fetch(BASE + '/api/caja', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fondoInicial: 0 })
  })
  const diaData = await diaRes.json()
  console.log('Dia:', diaData)
  
  // Create venta
  const ventaRes = await fetch(BASE + '/api/ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      productos: [{ productoId: tortaData.id, cantidad: 2 }],
      metodoPago: 'Efectivo',
      usuarioId: adminData.id
    })
  })
  const ventaData = await ventaRes.json()
  console.log('Venta:', JSON.stringify(ventaData, null, 2))
}

test().catch(console.error)