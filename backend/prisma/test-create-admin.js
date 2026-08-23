import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  try {
    const admin = await prisma.usuario.create({
      data: {
        tipo: 'Administrador',
        nombre: null,
        usuario: 'admin_test',
        contraseña: await bcrypt.hash('x', 10),
      },
    })
    console.log('Created admin:', admin)
    
    // Verify login works via direct Prisma
    const found = await prisma.usuario.findUnique({ where: { usuario: 'admin_test' } })
    console.log('Found:', found)
  } catch (e) {
    console.error('Error:', e.message)
  }
}

main().finally(() => prisma.$disconnect())