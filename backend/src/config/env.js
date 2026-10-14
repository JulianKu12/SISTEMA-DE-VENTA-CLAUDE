import 'dotenv/config'

const ENTORNOS_VALIDOS = new Set(['development', 'test', 'production'])
const LIMITES_PRODUCCION = {
  rateLimitLoginMax: 20,
  rateLimitGeneralMax: 1000,
}

function enteroPositivo(valor, nombre, predeterminado, maximo = Number.MAX_SAFE_INTEGER) {
  if (valor === undefined) return predeterminado
  if (!/^\d+$/.test(String(valor))) {
    throw new Error(`${nombre} debe ser un entero positivo`)
  }
  const numero = Number(valor)
  if (!Number.isSafeInteger(numero) || numero < 1 || numero > maximo) {
    throw new Error(`${nombre} debe estar entre 1 y ${maximo}`)
  }
  return numero
}

function validarOrigenes(corsOrigin, nodeEnv) {
  if (nodeEnv === 'production' && !corsOrigin?.trim()) {
    throw new Error('CORS_ORIGIN es obligatorio en producción y debe listar los orígenes del frontend')
  }

  const entradas = (corsOrigin || 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean)

  if (entradas.includes('*')) {
    if (nodeEnv === 'production') {
      throw new Error('CORS_ORIGIN no puede incluir "*" en producción')
    }
    if (entradas.length !== 1) {
      throw new Error('CORS_ORIGIN="*" no se puede combinar con otros orígenes')
    }
    return ['*']
  }

  const origenes = []
  for (const origen of entradas) {
    let url
    try {
      url = new URL(origen)
    } catch {
      throw new Error(`Origen inválido en CORS_ORIGIN: "${origen}"`)
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.pathname !== '/' && url.pathname !== '') ||
      url.search ||
      url.hash
    ) {
      throw new Error(`CORS_ORIGIN debe contener orígenes HTTP(S) sin rutas: "${origen}"`)
    }

    if (!origenes.includes(url.origin)) origenes.push(url.origin)
  }

  if (origenes.length === 0) {
    throw new Error('CORS_ORIGIN debe incluir al menos un origen válido')
  }
  return origenes
}

function validarSecretoJwt(secret, nodeEnv) {
  if (!secret) {
    throw new Error(
      'Falta la variable JWT_SECRET. Genera un secreto aleatorio con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    )
  }

  if (nodeEnv === 'production') {
    const normalizado = secret.trim().toLowerCase()
    const esMarcador =
      /^(.)\1+$/.test(normalizado) ||
      ['cambia-este-valor', 'change-me', 'example', 'placeholder', 'tu_secreto', 'secret'].some(
        (marcador) => normalizado.includes(marcador),
      )

    if (secret.length < 32 || esMarcador) {
      throw new Error(
        'JWT_SECRET en producción debe ser un secreto aleatorio de al menos 32 caracteres; no uses valores de ejemplo'
      )
    }
  }

  return secret
}

function validarDatabaseUrl(databaseUrl, nodeEnv) {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL es obligatoria y debe apuntar a un archivo SQLite (file:...)')
  }
  const archivo = databaseUrl.slice('file:'.length).split('?')[0].toLowerCase()
  if (!archivo || archivo === ':memory:' || archivo === ':memory') {
    throw new Error('DATABASE_URL debe apuntar a una base SQLite persistente, no a memoria')
  }
  if (nodeEnv === 'production' && /(^|[\\/])(dev|test)\.db$/.test(archivo)) {
    throw new Error('En producción, DATABASE_URL no puede apuntar a dev.db ni test.db')
  }
  return databaseUrl
}

function validarTrustProxy(trustProxy, nodeEnv) {
  if (trustProxy === undefined) {
    return nodeEnv === 'production' ? 1 : false
  }

  if (typeof trustProxy === 'number') {
    if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10) {
      throw new Error('TRUST_PROXY debe ser false, true, 0-10 o la cadena "loopback"/"linklocal"/"uniquelocal"')
    }
    return trustProxy
  }

  const valor = String(trustProxy).trim().toLowerCase()
  if (!valor) return nodeEnv === 'production' ? 1 : false

  if (['true', '1', 'yes', 'on'].includes(valor)) return 1
  if (['false', '0', 'no', 'off'].includes(valor)) return false
  if (['loopback', 'linklocal', 'uniquelocal'].includes(valor)) return valor
  if (/^\d+$/.test(valor)) {
    const numero = Number(valor)
    if (numero < 0 || numero > 10) {
      throw new Error('TRUST_PROXY debe ser false, true, 0-10 o la cadena "loopback"/"linklocal"/"uniquelocal"')
    }
    return numero
  }

  throw new Error('TRUST_PROXY debe ser false, true, 0-10 o la cadena "loopback"/"linklocal"/"uniquelocal"')
}

export function cargarConfiguracion(source = process.env) {
  const nodeEnv = source.NODE_ENV || 'development'
  if (!ENTORNOS_VALIDOS.has(nodeEnv)) {
    throw new Error(`NODE_ENV inválido: usa ${[...ENTORNOS_VALIDOS].join(', ')}`)
  }

  const rateLimitLoginMax = enteroPositivo(
    source.RATE_LIMIT_LOGIN_MAX,
    'RATE_LIMIT_LOGIN_MAX',
    5,
    nodeEnv === 'production' ? LIMITES_PRODUCCION.rateLimitLoginMax : undefined,
  )
  const rateLimitGeneralMax = enteroPositivo(
    source.RATE_LIMIT_GENERAL_MAX,
    'RATE_LIMIT_GENERAL_MAX',
    100,
    nodeEnv === 'production' ? LIMITES_PRODUCCION.rateLimitGeneralMax : undefined,
  )
  const backupIntervalHours = Number(source.BACKUP_INTERVAL_HOURS ?? 24)
  if (!Number.isFinite(backupIntervalHours) || backupIntervalHours <= 0 || backupIntervalHours > 8760) {
    throw new Error('BACKUP_INTERVAL_HOURS debe ser un número mayor que 0 y no superior a 8760')
  }
  if (source.BACKUP_DIR !== undefined && !source.BACKUP_DIR.trim()) {
    throw new Error('BACKUP_DIR no puede estar vacío')
  }

  const port = enteroPositivo(source.PORT, 'PORT', 3001, 65535)

  return {
    port,
    nodeEnv,
    jwtSecret: validarSecretoJwt(source.JWT_SECRET, nodeEnv),
    databaseUrl: validarDatabaseUrl(source.DATABASE_URL, nodeEnv),
    rateLimitLoginMax,
    rateLimitGeneralMax,
    corsOrigins: validarOrigenes(source.CORS_ORIGIN, nodeEnv),
    trustProxy: validarTrustProxy(source.TRUST_PROXY, nodeEnv),
    backupIntervalHours,
    backupDirectory: source.BACKUP_DIR,
  }
}

export const env = cargarConfiguracion()
