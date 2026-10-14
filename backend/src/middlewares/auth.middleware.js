import prisma from '../models/prisma.js'
import { HttpError } from '../utils/httpError.js'
import { verificarToken } from '../utils/jwt.js'

// Autenticación: exige un token Bearer válido en cada petición y adjunta el
// Usuario autenticado a req.usuario. /api/auth/login y /api/health se
// excluyen (docs/07 y rutas de arranque).
export const autenticar = async (req, _res, next) => {
  try {
    const encabezado = req.headers.authorization || ''
    const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null
    if (!token) throw new HttpError(401, 'Token de sesión requerido')

    let payload
    try {
      payload = verificarToken(token)
    } catch (error) {
      return next(error)
    }

    // La sesión debe corresponder al token guardado (logout lo invalida).
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.usuarioId },
      include: { empleado: { select: { id: true, estadoDisponibilidad: true } } },
    })
    if (!usuario || usuario.tokenSesion !== token) {
      throw new HttpError(401, 'Sesión inválida o cerrada')
    }

    req.usuario = usuario
    next()
  } catch (e) {
    next(e)
  }
}
