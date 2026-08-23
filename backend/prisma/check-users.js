import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.usuario.findMany({ select: { id: true, usuario: true, tipo: true } })
  console.log('Users:', users)
}

main().finally(() => prisma.$disconnect())