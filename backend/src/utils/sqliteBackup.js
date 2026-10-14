import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { prismaUrlForSqliteFile, resolveBackupDirectory, resolveDatabasePath } from './sqliteFiles.js'

async function validarIntegridad(filePath) {
  const client = new PrismaClient({
    datasources: { db: { url: prismaUrlForSqliteFile(filePath) } },
  })

  try {
    const resultado = await client.$queryRaw`PRAGMA integrity_check`
    const estado = resultado.length > 0 ? Object.values(resultado[0])[0] : null
    if (estado !== 'ok') {
      throw new Error(`La base SQLite no pasó integrity_check: ${String(estado)}`)
    }

    const tablas = await client.$queryRaw`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('Usuario', 'Venta', 'Dia_Operativo', 'Movimiento_Inventario')
    `
    const presentes = new Set(tablas.map((tabla) => tabla.name))
    const faltantes = ['Usuario', 'Venta', 'Dia_Operativo', 'Movimiento_Inventario'].filter(
      (nombre) => !presentes.has(nombre),
    )
    if (faltantes.length > 0) {
      throw new Error(`El archivo no contiene las tablas requeridas del POS: ${faltantes.join(', ')}`)
    }
  } finally {
    await client.$disconnect()
  }
}

function crearNombreRespaldo(fecha = new Date()) {
  const marcaTiempo = fecha.toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return `pos-${marcaTiempo}.db`
}

async function rutaNoExistente(directory, baseName) {
  const extension = path.extname(baseName)
  const stem = path.basename(baseName, extension)
  let index = 0

  while (true) {
    const name = index === 0 ? baseName : `${stem}-${index}${extension}`
    const candidate = path.join(directory, name)
    try {
      await fs.access(candidate)
      index++
    } catch (error) {
      if (error.code === 'ENOENT') return candidate
      throw error
    }
  }
}

export async function crearRespaldoSQLite({
  prismaClient,
  databasePath = resolveDatabasePath(),
  backupDirectory = resolveBackupDirectory(),
}) {
  const source = path.resolve(databasePath)
  const stat = await fs.stat(source)
  if (!stat.isFile()) throw new Error(`La base de datos no es un archivo: ${source}`)

  const destinationDirectory = path.resolve(backupDirectory)
  await fs.mkdir(destinationDirectory, { recursive: true })
  const destination = await rutaNoExistente(destinationDirectory, crearNombreRespaldo())

  try {
    await prismaClient.$executeRaw`VACUUM INTO ${destination}`
    await validarIntegridad(destination)
    const backupStat = await fs.stat(destination)
    if (!backupStat.isFile() || backupStat.size === 0) {
      throw new Error(`El respaldo generado está vacío: ${destination}`)
    }
    return destination
  } catch (error) {
    await fs.rm(destination, { force: true })
    throw error
  }
}

export async function verificarRespaldoSQLite(filePath) {
  const resolved = path.resolve(filePath)
  const stat = await fs.stat(resolved)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`El archivo de respaldo no existe o está vacío: ${resolved}`)
  }
  await validarIntegridad(resolved)
  return resolved
}

export async function reemplazarBaseSQLite({ databasePath, backupPath }) {
  const target = path.resolve(databasePath)
  const source = await verificarRespaldoSQLite(backupPath)
  const targetKey = process.platform === 'win32' ? target.toLowerCase() : target
  const sourceKey = process.platform === 'win32' ? source.toLowerCase() : source
  if (sourceKey === targetKey) {
    throw new Error('El archivo de respaldo no puede ser la base de datos activa')
  }

  const candidate = `${target}.restore-${process.pid}.tmp`
  const sidecars = [`${target}-wal`, `${target}-shm`, `${target}-journal`]
  try {
    await fs.copyFile(source, candidate)
    await verificarRespaldoSQLite(candidate)
    await fs.rename(candidate, target)
    for (const sidecar of sidecars) await fs.rm(sidecar, { force: true })
  } catch (error) {
    await fs.rm(candidate, { force: true })
    throw error
  }
}
