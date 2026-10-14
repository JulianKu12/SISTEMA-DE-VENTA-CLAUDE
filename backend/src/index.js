import app from './app.js'
import { env } from './config/env.js'
import prisma from './models/prisma.js'
import { iniciarRespaldosAutomaticos } from './utils/sqliteBackupScheduler.js'
import { logInfo } from './utils/logger.js'

const detenerRespaldos = iniciarRespaldosAutomaticos({
  prismaClient: prisma,
  intervalHours: env.backupIntervalHours,
})

const server = app.listen(env.port, () => {
  logInfo('server.started', {
    port: env.port,
    environment: env.nodeEnv,
  })
})

async function shutdown() {
  await detenerRespaldos()
  await prisma.$disconnect()
  server.close(() => {
    logInfo('server.stopped')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)