import { createTestPrisma } from './require-test-db.js'

const prisma = createTestPrisma()

async function main() {
  const users = await prisma.usuario.findMany({ select: { id: true, usuario: true, tipo: true } })
  console.log('Users:', users)
}

main().finally(() => prisma.$disconnect())