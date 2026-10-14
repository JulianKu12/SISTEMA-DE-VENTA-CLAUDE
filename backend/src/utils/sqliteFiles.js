import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const schemaDirectory = path.join(backendDirectory, 'prisma')

export function resolveDatabasePath(databaseUrl = process.env.DATABASE_URL) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL debe ser una ruta SQLite con formato file:...')
  }

  let databaseFile = decodeURIComponent(databaseUrl.slice('file:'.length).split('?')[0])
  if (!databaseFile) throw new Error('DATABASE_URL no contiene una ruta de archivo SQLite')

  if (/^[/\\]+[a-zA-Z]:[/\\]/.test(databaseFile)) {
    databaseFile = databaseFile.replace(/^[/\\]+/, '')
  }

  return path.isAbsolute(databaseFile)
    ? path.resolve(databaseFile)
    : path.resolve(schemaDirectory, databaseFile)
}

export function resolveBackupDirectory(directory = process.env.BACKUP_DIR) {
  if (!directory) return path.join(backendDirectory, 'backups')
  return path.isAbsolute(directory) ? path.resolve(directory) : path.resolve(backendDirectory, directory)
}

export function prismaUrlForSqliteFile(filePath) {
  const relativePath = path.relative(schemaDirectory, path.resolve(filePath)).replaceAll('\\', '/')
  return `file:${relativePath}`
}

export { backendDirectory, schemaDirectory }
