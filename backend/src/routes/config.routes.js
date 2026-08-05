import { Router } from 'express'
import {
  estadoConfig,
  obtenerCostoEnvio,
  actualizarCostoEnvio,
  obtenerRepartidorUnico,
  actualizarRepartidorUnico,
} from '../controllers/config.controller.js'

const router = Router()

router.get('/', estadoConfig)
router.get('/costo-envio', obtenerCostoEnvio)
router.patch('/costo-envio', actualizarCostoEnvio)
router.get('/repartidor-unico', obtenerRepartidorUnico)
router.patch('/repartidor-unico', actualizarRepartidorUnico)

export default router
