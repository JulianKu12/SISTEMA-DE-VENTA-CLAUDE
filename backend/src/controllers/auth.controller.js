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
  const { usuario, contraseña } = req.body
  if (!usuario || !contraseña) {
    throw new HttpError(400, 'usuario y contraseña son obligatorios')
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
