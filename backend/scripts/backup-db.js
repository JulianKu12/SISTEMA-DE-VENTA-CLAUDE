import 'dotenv/config'
import prisma from '../src/models/prisma.js'
import { crearRespaldoSQLite } from '../src/utils/sqliteBackup.js'

try {
  const filePath = await crearRespaldoSQLite({ prismaClient: prisma })
  console.log(`Respaldo creado y verificado: ${filePath}`)
} catch (error) {
  console.error('No se pudo crear el respaldo SQLite:', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
