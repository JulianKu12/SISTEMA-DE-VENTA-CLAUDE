import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.usuario.findMany({ select: { id: true, usuario: true, tipo: true, empleado: { select: { id: true, estadoDisponibilidad: true } } } })
  console.log('Users:', JSON.stringify(users, null, 2))
}

main().finally(() => prisma.$disconnect())