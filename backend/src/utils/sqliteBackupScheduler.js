import { crearRespaldoSQLite } from './sqliteBackup.js'
import { resolveBackupDirectory, resolveDatabasePath } from './sqliteFiles.js'
import { logError, logInfo } from './logger.js'

export function iniciarRespaldosAutomaticos({
  prismaClient,
  intervalHours = 24,
  backupDirectory = resolveBackupDirectory(),
  databasePath = resolveDatabasePath(),
  logger = { info: logInfo, error: logError },
}) {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
    throw new Error('BACKUP_INTERVAL_HOURS debe ser un número mayor que 0')
  }

  let respaldoEnCurso = null
  const ejecutarRespaldo = () => {
    if (respaldoEnCurso) return respaldoEnCurso

    respaldoEnCurso = crearRespaldoSQLite({
      prismaClient,
      databasePath,
      backupDirectory,
    })
      .then((filePath) => {
        logger.info('backup.completed', { path: filePath })
      })
      .catch((error) => {
        logger.error('backup.failed', {
          errorName: error?.name || 'Error',
          errorCode: typeof error?.code === 'string' ? error.code : undefined,
        })
      })
      .finally(() => {
        respaldoEnCurso = null
      })
    return respaldoEnCurso
  }

  void ejecutarRespaldo()
  const timer = setInterval(ejecutarRespaldo, intervalHours * 60 * 60 * 1000)
  timer.unref()

  return async function detenerRespaldos() {
    clearInterval(timer)
    if (respaldoEnCurso) await respaldoEnCurso
  }
}
