import { createTestPrisma } from './require-test-db.js'
import bcrypt from 'bcrypt'

const prisma = createTestPrisma()

async function main() {
  try {
    const admin = await prisma.usuario.create({
      data: {
        tipo: 'Administrador',
        usuario: 'admin_test4',
        contraseña: await bcrypt.hash('x', 10),
      },
    })
    console.log('Created admin_test4:', admin.id)
  } catch (e) {
    console.error('Error:', e.message)
  }
}

main().finally(() => prisma.$disconnect())