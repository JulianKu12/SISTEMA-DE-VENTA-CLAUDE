import { createTestPrisma } from './require-test-db.js'

const prisma = createTestPrisma()

async function main() {
  const user = await prisma.usuario.findUnique({ where: { usuario: 'admin_test' } })
  console.log('User:', user)
}

main().finally(() => prisma.$disconnect())