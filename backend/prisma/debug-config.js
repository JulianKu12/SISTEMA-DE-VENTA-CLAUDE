import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()
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
    data: { tipo: 'Administrador', usuario: 'admin_test7', contraseña: await bcrypt.hash('x', 10) }
  })
  console.log('Created admin:', admin.id)
  
  // Login
  const loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test7', contraseña: 'x' })
  })
  const loginData = await loginRes.json()
  console.log('Login:', loginRes.status, loginData)
  const token = loginData.token
  
  // Test configuracion
  const configRes = await fetch(BASE + '/api/configuracion', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const configData = await configRes.json()
  console.log('Config:', configRes.status, configData)
}

main().catch(console.error).finally(() => prisma.$disconnect())