import { HttpError } from './httpError.js'

// Mientras no exista autenticación completa, se resuelve el usuario de la
// petición: si el body trae usuarioId se usa; si no, se busca al único
// Administrador. El Administrador es quien ejecuta todas las acciones del
// módulo de productos (ver docs/07-modulo-roles.md).
export async function resolverUsuario(db, body = {}) {
  if (body.usuarioId) {
    const usuario = await db.usuario.findUnique({ where: { id: Number(body.usuarioId) } })
    if (!usuario) throw new HttpError(404, 'El usuario indicado no existe')
    return usuario.id
  }
  const admin = await db.usuario.findFirst({ where: { tipo: 'Administrador' } })
  if (!admin) throw new HttpError(500, 'No hay un usuario Administrador configurado. Envía usuarioId en la petición.')
  return admin.id
}