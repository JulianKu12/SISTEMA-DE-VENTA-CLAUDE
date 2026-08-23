import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.usuario.create({
    data: {
      tipo: 'Administrador',
      nombre: null,
      usuario: 'admin_test',
      contraseña: await bcrypt.hash('x', 10),
    },
  })
  console.log('Created admin:', admin.id)
}

main().finally(() => prisma.$disconnect())