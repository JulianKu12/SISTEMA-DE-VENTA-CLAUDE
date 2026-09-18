import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.usuario.findFirst({ where: { tipo: 'Administrador' } })
  if (existing) {
    console.log(`Ya existe administrador: ${existing.usuario}`)
    return
  }
  
  const hash = await bcrypt.hash('admin123', 10)
  const admin = await prisma.usuario.create({
    data: {
      tipo: 'Administrador',
      nombre: 'Administrador',
      usuario: 'admin',
      contraseña: hash,
    },
  })
  console.log(`Administrador creado: ${admin.usuario} (id=${admin.id})`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())