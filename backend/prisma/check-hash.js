import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.usuario.findUnique({ where: { usuario: 'admin_test' } })
  console.log('User:', user)
}

main().finally(() => prisma.$disconnect())