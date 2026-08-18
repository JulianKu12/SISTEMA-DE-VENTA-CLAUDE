import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import apiRoutes from './routes/index.js'
import authRoutes from './routes/auth.routes.js'
import { autenticar } from './middlewares/auth.middleware.js'
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js'
import { env } from './config/env.js'

const app = express()

// Headers de seguridad básicos (incluye una Content Security Policy razonable
// por defecto). Para una API JSON no afecta las respuestas.
app.use(helmet())

// CORS restringido: solo se aceptan los orígenes configurados en CORS_ORIGIN
// (por defecto el frontend de desarrollo http://localhost:5173). Peticiones
// sin cabecera Origin (curl, scripts, apps nativas) no se ven afectadas.
app.use(cors({ origin: env.corsOrigins.includes('*') ? '*' : env.corsOrigins }))

// Límite de tamaño del body (1mb) para evitar que una petición gigante tumbe
// el servidor.
app.use(express.json({ limit: '1mb' }))

// Anti-abuso permisivo para toda la API: RATE_LIMIT_GENERAL_MAX (100 por
// defecto) peticiones por IP por minuto. El login tiene su propio límite
// (auth.routes.js). Configurable con RATE_LIMIT_GENERAL_MAX.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.rateLimitGeneralMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Demasiadas peticiones, espera un momento antes de continuar.' },
})

// Login público; el resto del /api exige token (excepto /api/health).
app.use('/api/auth', authRoutes)
app.use('/api', generalLimiter, (req, res, next) => {
  if (req.path === '/health') return next()
  return autenticar(req, res, next)
})
app.use('/api', apiRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
