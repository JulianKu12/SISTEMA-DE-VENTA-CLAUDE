import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Wait a bit for test to create user
  await new Promise(r => setTimeout(r, 3000))
  
  const users = await prisma.usuario.findMany({ select: { id: true, usuario: true, tipo: true, contraseña: true } })
  console.log('Users during test:', JSON.stringify(users, null, 2))
}

main().finally(() => prisma.$disconnect())