// Guard de seguridad para scripts de limpieza/prueba/debug manuales.
// NUNCA deben caer al fallback silencioso del .env real (file:./dev.db): el
// incidente de que clean-test-db2.js borrara dev.db fue causado exactamente por
// ese fallback. Por eso estos scripts usan createTestPrisma() en lugar de
// new PrismaClient() desnudo: exige que DATABASE_URL esté seteado apuntando a
// una BD de prueba y falla con error claro si falta o si apunta a dev.db.
import { PrismaClient } from '@prisma/client'

export function requireTestDatabase() {
  const url = process.env.DATABASE_URL
  if (!url || !url.trim()) {
    throw new Error(
      'DATABASE_URL no está seteado. Este script de limpieza/prueba NUNCA debe ' +
        'caer al .env real (file:./dev.db). Setéala apuntando a la BD de prueba, p.ej.:\n' +
        "  PowerShell:  $env:DATABASE_URL='file:./sec_test.db'; node <script>\n" +
        '  cmd:         set DATABASE_URL=file:./sec_test.db && node <script>'
    )
  }
  if (/dev\.db/i.test(url)) {
    throw new Error(
      `DATABASE_URL apunta a dev.db ("${url}"). Este script de limpieza/prueba está ` +
        'bloqueado contra la BD de desarrollo. Usá una BD de prueba, p.ej.:\n' +
        "  PowerShell:  $env:DATABASE_URL='file:./sec_test.db'; node <script>"
    )
  }
  return url
}

export function createTestPrisma() {
  const url = requireTestDatabase()
  return new PrismaClient({ datasources: { db: { url } } })
}