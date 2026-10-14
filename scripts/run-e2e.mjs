import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const prismaDirectory = path.join(root, 'backend', 'prisma')
const databaseName = `e2e-${randomUUID()}.db`
const databasePath = path.join(prismaDirectory, databaseName)
const databaseUrl = `file:./${databaseName}`
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: 'e2e-test-secret-that-is-not-used-outside-this-temporary-database',
  NODE_ENV: 'test',
  PORT: '3211',
  CORS_ORIGIN: 'http://127.0.0.1:5174',
  VITE_API_PROXY_TARGET: 'http://127.0.0.1:3211',
}
const npmCli = process.env.npm_execpath

if (!npmCli) {
  throw new Error('Ejecuta las pruebas E2E mediante npm run test:e2e')
}

function runNpm(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`El comando npm ${args.join(' ')} terminó con código ${result.status}`)
  }
}

function removeTemporaryDatabase() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    rmSync(`${databasePath}${suffix}`, { force: true })
  }
}

try {
  runNpm(['run', 'db:push:e2e', '-w', 'backend'])
  runNpm(['run', 'test:e2e:seed', '-w', 'backend'])
  runNpm(['run', 'test:e2e:playwright'])
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  removeTemporaryDatabase()
}
