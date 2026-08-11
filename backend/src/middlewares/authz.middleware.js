import prisma from '../models/prisma.js'
import { HttpError } from '../utils/httpError.js'

// Matriz de permisos docs/07-modulo-roles.md:
//   - Administrador: acceso total.
//   - Repartidor: SOLO sus pedidos asignados, marcarlos Entregado y usar
//     "No cobrar" en ventas y pedidos a domicilio.
//   - Fail-safe: cualquier endpoint no listado para Repartidor queda
//     bloqueado para ese rol (403).

export const soloAdministrador = (req, _res, next) => {
  if (req.usuario?.tipo !== 'Administrador') {
    return next(new HttpError(403, 'Solo el Administrador puede realizar esta acción'))
  }
  next()
}

// Repartidor puede registrar una venta SOLO con "No cobrar" (docs/07 y docs/04).
export const repartidorNoCobrarVenta = (req, _res, next) => {
  if (req.usuario?.tipo === 'Administrador') return next()
  if (req.body?.noCobrar !== true) {
    return next(new HttpError(403, 'El Repartidor solo puede registrar ventas con "No cobrar"'))
  }
  next()
}

// Repartidor puede crear un pedido SOLO A_domicilio y con "No cobrar"
// (usar "No cobrar" en pedidos a domicilio; tomar pedidos normales es de
// Administrador).
export const repartidorNoCobrarPedido = (req, _res, next) => {
  if (req.usuario?.tipo === 'Administrador') return next()
  if (req.body?.tipo !== 'A_domicilio' || req.body?.noCobrar !== true) {
    return next(
      new HttpError(403, 'El Repartidor solo puede crear pedidos A_domicilio con "No cobrar"')
    )
  }
  next()
}

// Repartidor solo consulta SUS propios pedidos asignados.
export const repartidorSoloSusPedidos = (req, _res, next) => {
  if (req.usuario?.tipo === 'Administrador') return next()
  const empleadoId = req.usuario.empleado?.id
  if (empleadoId == null || Number(req.params.repartidorId) !== empleadoId) {
    return next(new HttpError(403, 'Un Repartidor solo puede consultar sus propios pedidos'))
  }
  next()
}

// Repartidor solo puede marcar Entregado un pedido asignado a él. El
// Administrador, por contraste, NO puede marcar Enviado en un A_domicilio ya
// asignado a un repartidor (docs/07): ese tramo del flujo es del repartidor.
export const repartidorSoloEntregado = async (req, _res, next) => {
  try {
    if (req.usuario?.tipo === 'Administrador') {
      if (req.body?.estadoPreparacion === 'Enviado') {
        const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } })
        if (pedido?.tipo === 'A_domicilio' && pedido.repartidorId != null) {
          return next(
            new HttpError(
              403,
              'El pedido está asignado a un repartidor; el repartidor es quien gestiona la entrega'
            )
          )
        }
      }
      return next()
    }
    if (req.body?.estadoPreparacion !== 'Entregado') {
      return next(new HttpError(403, 'El Repartidor solo puede marcar pedidos como Entregado'))
    }
    const empleadoId = req.usuario.empleado?.id
    if (empleadoId == null) {
      return next(new HttpError(403, 'El Repartidor no tiene un perfil de repartidor vinculado'))
    }
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } })
    if (!pedido || pedido.repartidorId !== empleadoId) {
      return next(new HttpError(403, 'Solo puedes marcar como Entregado tus propios pedidos'))
    }
    next()
  } catch (e) {
    next(e)
  }
}

// Repartidor puede cobrar (pasar estado_pago a Pagado) SOLO un pedido que le
// esté asignado y que sea A_domicilio: él es quien recibe el dinero en la
// entrega (docs/07). El Administrador lo puede hacer en cualquier pedido SIN
// repartidor asignado (ej. Para_recoger), pero quedan bloqueados los
// A_domicilio ya asignados: el cobro de esos pedidos lo hace el repartidor.
export const repartidorSoloEstadoPago = async (req, _res, next) => {
  try {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } })
    if (!pedido) {
      return next(new HttpError(404, 'Pedido no encontrado'))
    }
    if (req.usuario?.tipo === 'Administrador') {
      if (pedido.tipo === 'A_domicilio' && pedido.repartidorId != null) {
        return next(
          new HttpError(
            403,
            'El pedido está asignado a un repartidor; el repartidor es quien cobra en la entrega'
          )
        )
      }
      return next()
    }
    const empleadoId = req.usuario.empleado?.id
    if (empleadoId == null) {
      return next(new HttpError(403, 'El Repartidor no tiene un perfil de repartidor vinculado'))
    }
    if (pedido.tipo !== 'A_domicilio') {
      return next(new HttpError(403, 'Un Repartidor solo puede cobrar pedidos A_domicilio'))
    }
    if (pedido.repartidorId !== empleadoId) {
      return next(new HttpError(403, 'Solo puedes cobrar tus propios pedidos a domicilio'))
    }
    next()
  } catch (e) {
    next(e)
  }
}
