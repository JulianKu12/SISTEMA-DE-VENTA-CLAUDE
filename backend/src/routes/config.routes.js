import { Router } from 'express'
import {
  estadoConfig,
  actualizarConfiguracion,
  obtenerCostoEnvio,
  actualizarCostoEnvio,
  obtenerRepartidorUnico,
  actualizarRepartidorUnico,
} from '../controllers/config.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', estadoConfig)
router.patch('/', actualizarConfiguracion)
router.get('/costo-envio', obtenerCostoEnvio)
router.patch('/costo-envio', actualizarCostoEnvio)
router.get('/repartidor-unico', obtenerRepartidorUnico)
router.patch('/repartidor-unico', actualizarRepartidorUnico)

export default router
