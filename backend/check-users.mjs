import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient({ datasources: { db: { url: 'file:./sec_test.db' } } })
async function main() {
  const users = await prisma.usuario.findMany()
  console.log(users.map(u => u.usuario))
  await prisma.$disconnect()
}
main().catch(console.error)