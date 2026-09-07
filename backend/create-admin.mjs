import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient({ datasources: { db: { url: 'file:./dev.db' } } })

async function main() {
  const hash = await bcrypt.hash('admin123', 10)
  await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: { tipo: 'Administrador', nombre: 'Administrador', usuario: 'admin', contraseña: hash }
  })
  console.log('Admin creado: admin / admin123')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1); })