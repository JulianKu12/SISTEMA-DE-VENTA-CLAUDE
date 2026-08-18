import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { login, logout } from '../controllers/auth.controller.js'
import { autenticar } from '../middlewares/auth.middleware.js'
import { env } from '../config/env.js'

const router = Router()

// Anti fuerza bruta (seguridad): máximo RATE_LIMIT_LOGIN_MAX (5 por defecto)
// intentos FALLIDOS de login por IP cada 15 minutos. Los intentos exitosos no
// se cuentan (skipSuccessfulRequests). Configurable con RATE_LIMIT_LOGIN_MAX.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimitLoginMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Demasiados intentos, espera unos minutos antes de volver a intentarlo.' },
})

router.post('/login', loginLimiter, login)
router.post('/logout', autenticar, logout)

export default router
