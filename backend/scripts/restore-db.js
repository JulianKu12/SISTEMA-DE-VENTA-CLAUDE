import 'dotenv/config'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import prisma from '../src/models/prisma.js'
import {
  crearRespaldoSQLite,
  reemplazarBaseSQLite,
  verificarRespaldoSQLite,
} from '../src/utils/sqliteBackup.js'
import { resolveBackupDirectory, resolveDatabasePath } from '../src/utils/sqliteFiles.js'

async function main() {
  const backupArgument = process.argv[2]
  if (!backupArgument) {
    throw new Error('Uso: npm run db:restore -- <ruta-al-respaldo.db>')
  }

  const databasePath = resolveDatabasePath()
  const backupPath = await verificarRespaldoSQLite(path.resolve(backupArgument))
  if (
    (process.platform === 'win32' ? backupPath.toLowerCase() : backupPath) ===
    (process.platform === 'win32' ? databasePath.toLowerCase() : databasePath)
  ) {
    throw new Error('El archivo de respaldo no puede ser la base de datos activa')
  }

  console.warn('ATENCIÓN: se reemplazará la base de datos activa con este respaldo.')
  console.warn('Asegúrate de detener el backend antes de continuar.')
  console.warn('Se creará una copia de seguridad del estado actual y no se borrarán respaldos antiguos.')
  const terminal = readline.createInterface({ input: stdin, output: stdout })
  let confirmacion
  try {
    confirmacion = await terminal.question('Escribe RESTAURAR para confirmar: ')
  } finally {
    terminal.close()
  }
  if (confirmacion !== 'RESTAURAR') {
    console.log('Restauración cancelada; no se modificó la base de datos.')
    return
  }

  const backupDirectory = resolveBackupDirectory()
  const copiaPrevia = await crearRespaldoSQLite({
    prismaClient: prisma,
    databasePath,
    backupDirectory,
  })
  await prisma.$disconnect()
  await reemplazarBaseSQLite({ databasePath, backupPath })

  console.log(`Base restaurada y verificada desde: ${backupPath}`)
  console.log(`Copia del estado anterior conservada en: ${copiaPrevia}`)
}

try {
  await main()
} catch (error) {
  console.error('No se pudo restaurar la base SQLite:', error)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
