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

const router = Router()

router.post('/', crearPedido)
router.get('/', listarPedidos)
router.get('/repartidor/:repartidorId', pedidosPorRepartidor)
router.patch('/:id/estado-pago', cambiarEstadoPago)
router.patch('/:id/estado-preparacion', cambiarEstadoPreparacion)
router.get('/:id/detalle', detallePedido)
router.patch('/:id', editarPedido)

export default router
