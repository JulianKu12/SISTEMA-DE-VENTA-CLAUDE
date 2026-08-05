import app from './app.js'
import { env } from './config/env.js'
import prisma from './models/prisma.js'

const server = app.listen(env.port, () => {
  console.log(`Backend corriendo en http://localhost:${env.port}`)
})

async function shutdown() {
  await prisma.$disconnect()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)