import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient({ datasources: { db: { url: 'file:./sec_test.db' } } })

async function main() {
  const users = [
    { usuario: 'admin_test', contraseña: 'x' },
    { usuario: 'admin_test4', contraseña: 'x' },
    { usuario: 'admin_test5', contraseña: 'x' },
    { usuario: 'admin_test6', contraseña: 'x' },
    { usuario: 'admin_test7', contraseña: 'admin7' },
  ]

  for (const u of users) {
    const hash = await bcrypt.hash(u.contraseña, 10)
    await prisma.usuario.upsert({
      where: { usuario: u.usuario },
      update: {},
      create: { tipo: 'Administrador', nombre: 'Administrador', usuario: u.usuario, contraseña: hash }
    })
    console.log(`Creado: ${u.usuario} / ${u.contraseña}`)
  }
  
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1); })