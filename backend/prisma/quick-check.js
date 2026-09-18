import { createTestPrisma } from './require-test-db.js'

const prisma = createTestPrisma()

async function main() {
  await new Promise(r => setTimeout(r, 3000))
  const users = await prisma.usuario.findMany({ select: { id: true, usuario: true, tipo: true, contraseña: true } })
  console.log('Users:', JSON.stringify(users, null, 2))
}

main().finally(() => prisma.$disconnect())