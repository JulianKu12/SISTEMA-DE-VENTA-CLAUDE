const BASE = 'http://localhost:3001'

async function testLogin() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test', contraseña: 'x' }),
  })
  const text = await res.text()
  console.log('Status:', res.status)
  console.log('Response:', text)
}

testLogin().catch(console.error)