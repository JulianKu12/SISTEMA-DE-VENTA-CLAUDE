import bcrypt from 'bcrypt'
import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { firmarToken } from '../utils/jwt.js'

// Login: valida usuario/contraseña contra el modelo Usuario (docs/07).
// Funciona igual para tipo=Administrador y tipo=Repartidor. Emite un JWT
// simple y lo guarda en Usuario.token_sesion para mantener la sesión
// persistente en el dispositivo (cierre de sesión manual al cambiar/limpiar).
export const login = asyncHandler(async (req, res) => {
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'El cuerpo de la petición debe ser un objeto JSON')
  }

  const { usuario, contraseña } = body
  if (typeof usuario !== 'string' || typeof contraseña !== 'string' || !usuario || !contraseña) {
    throw new HttpError(400, 'usuario y contraseña son obligatorios')
  }
  if (usuario.length > 100 || contraseña.length > 1024) {
    throw new HttpError(400, 'usuario o contraseña exceden la longitud permitida')
  }

  const cuenta = await prisma.usuario.findUnique({
    where: { usuario },
    include: { empleado: { select: { id: true, nombre: true, estadoDisponibilidad: true } } },
  })
  // Las contraseñas se guardan hasheadas con bcrypt (nunca en texto plano).
  // `bcrypt.compare` es a prueba de "timing attack" y reutiliza los hashes
  // viejos (sin prefijo bcrypt) fallando la comparación.
  const hashValido =
    cuenta?.contraseña?.startsWith('$2') &&
    (await bcrypt.compare(contraseña, cuenta.contraseña))
  if (!cuenta || !hashValido) {
    throw new HttpError(401, 'Credenciales inválidas')
  }

  // Repartidor dado de baja: no se permite iniciar sesión. La validación va
  // después de las credenciales para no filtrar el estado de la cuenta a
  // intentos con contraseña incorrecta (docs/07).
  if (cuenta.empleado?.estadoDisponibilidad === 'Inactivo') {
    throw new HttpError(403, 'Tu cuenta está inactiva, contacta al administrador')
  }

  const token = firmarToken({ usuarioId: cuenta.id, tipo: cuenta.tipo })
  await prisma.usuario.update({
    where: { id: cuenta.id },
    data: { tokenSesion: token },
  })

  res.json({
    mensaje: 'Login correcto',
    token,
    usuario: {
      id: cuenta.id,
      tipo: cuenta.tipo,
      nombre: cuenta.nombre,
      usuario: cuenta.usuario,
      ...(cuenta.empleado
        ? { empleado: { id: cuenta.empleado.id, nombre: cuenta.empleado.nombre } }
        : {}),
    },
  })
})

// Cierre de sesión manual: invalida el token guardado.
export const logout = asyncHandler(async (req, res) => {
  if (req.usuario?.id) {
    await prisma.usuario.update({ where: { id: req.usuario.id }, data: { tokenSesion: null } })
  }
  res.json({ mensaje: 'Sesión cerrada' })
})
