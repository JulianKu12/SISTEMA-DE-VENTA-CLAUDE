import { Router } from 'express'
import {
  crearPedido,
  listarPedidos,
  detallePedido,
  pedidosPorRepartidor,
  cambiarEstadoPago,
  cambiarEstadoPreparacion,
  editarPedido,
} from '../controllers/pedidos.controller.js'
import {
  soloAdministrador,
  repartidorNoCobrarPedido,
  repartidorSoloSusPedidos,
  repartidorSoloEntregado,
  repartidorSoloEstadoPago,
} from '../middlewares/authz.middleware.js'

const router = Router()

// Repartidor: SOLO pedidos A_domicilio con "No cobrar"; tomar pedidos
// normales es de Administrador.
router.post('/', repartidorNoCobrarPedido, crearPedido)

// Ver todos los pedidos / detalle / estado de pago / editar: Administrador
// (salvo el estado_de_pago, que el Repartidor también puede ajustar SOLO en
// SUS pedidos A_domicilio asignados).
router.get('/', soloAdministrador, listarPedidos)
router.get('/:id/detalle', soloAdministrador, detallePedido)
router.patch('/:id/estado-pago', repartidorSoloEstadoPago, cambiarEstadoPago)
router.patch('/:id', soloAdministrador, editarPedido)

// Repartidor consulta solo sus pedidos y solo marca Entregado los suyos.
router.get('/repartidor/:repartidorId', repartidorSoloSusPedidos, pedidosPorRepartidor)
router.patch('/:id/estado-preparacion', repartidorSoloEntregado, cambiarEstadoPreparacion)

export default router
