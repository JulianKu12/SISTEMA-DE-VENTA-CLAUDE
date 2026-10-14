import app from '../src/app.js'
import prisma from '../src/models/prisma.js'
import { env } from '../src/config/env.js'

const server = app.listen(env.port, '127.0.0.1')

server.on('error', (error) => {
  console.error('No se pudo iniciar el servidor E2E:', error)
  process.exitCode = 1
})

async function cerrarServidor() {
  server.close(async () => {
    await prisma.$disconnect()
    process.exit()
  })
}

process.on('SIGINT', cerrarServidor)
process.on('SIGTERM', cerrarServidor)
