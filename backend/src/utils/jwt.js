import jwt from 'jsonwebtoken'
import { HttpError } from './httpError.js'
import { env } from '../config/env.js'

// JWT HS256 con la librería estándar jsonwebtoken (docs/07: sesión persistente).
// Usa el mismo JWT_SECRET configurado en env.js.
const OPCIONES = { expiresIn: '7d' }

export function firmarToken(payload) {
  return jwt.sign(payload, env.jwtSecret, OPCIONES)
}

export function verificarToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret)
  } catch (e) {
    if (e && e.name === 'TokenExpiredError') {
      throw new HttpError(401, 'Sesión expirada')
    }
    throw new HttpError(401, 'Token de sesión inválido')
  }
}
