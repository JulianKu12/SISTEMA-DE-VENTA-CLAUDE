import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '..')
const testDbPath = path.join(backendDir, 'prisma', `.test-${process.pid}-${randomUUID()}.db`)
const testDbFiles = [testDbPath, `${testDbPath}-journal`, `${testDbPath}-wal`, `${testDbPath}-shm`]

const env = {
  ...process.env,
  DATABASE_URL: `file:./${path.basename(testDbPath)}`,
  JWT_SECRET: process.env.JWT_SECRET || 'test-secret-for-backend-node-test',
  RATE_LIMIT_GENERAL_MAX: process.env.RATE_LIMIT_GENERAL_MAX || '500',
  NODE_ENV: 'test',
}

for (const filePath of testDbFiles) {
  fs.rmSync(filePath, { force: true })
}

try {
  execSync('npx prisma db push --schema prisma/schema.prisma --skip-generate', {
    cwd: backendDir,
    stdio: 'inherit',
    env,
  })

  execSync('node --test --test-concurrency=1 tests/**/*.test.js', {
    cwd: backendDir,
    stdio: 'inherit',
    env,
  })
} finally {
  for (const filePath of testDbFiles) {
    fs.rmSync(filePath, { force: true })
  }
}
