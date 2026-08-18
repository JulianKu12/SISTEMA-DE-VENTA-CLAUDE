import 'dotenv/config'

// Seguridad: JWT_SECRET es OBLIGATORIO. Sin él el servidor NO arranca (no hay
// ningún fallback hardcodeado, ver README/security). Genera uno con:
//   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  throw new Error(
    'Falta la variable JWT_SECRET en el archivo .env del backend. ' +
      'Genera un secreto aleatorio con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  )
}

export const env = {
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret,
  // Límites de peticiones (rate limiting, docs/seguridad):
  rateLimitLoginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
  rateLimitGeneralMax: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 100,
  // Orígenes permitidos para CORS (lista separada por comas). Por defecto el
  // frontend de desarrollo local; ajusta por instalación con CORS_ORIGIN (p.
  // ej. la IP/puerto real de la tablet). Solo usa '*' si lo necesitas de verdad.
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}