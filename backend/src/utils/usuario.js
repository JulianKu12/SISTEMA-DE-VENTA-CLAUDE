import { HttpError } from './httpError.js'

// La ÚNICA fuente del usuario que ejecuta una acción es req.usuario.id,
// proveniente del middleware de autenticación (docs/07). Cualquier
// "usuarioId" enviado en el body se ignora por completo: la auditoría
// (ej. "No cobrar") siempre registra el usuario real del token.
export function resolverUsuario(req = {}) {
  if (!req.usuario?.id) throw new HttpError(401, 'Usuario no autenticado')
  return req.usuario.id
}
