import { Router } from 'express'
import { abrirCaja, cerrarCaja, completarCorte, estadoCaja, historialCaja } from '../controllers/caja.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/estado', estadoCaja)
router.get('/historial', historialCaja)
router.post('/abrir', abrirCaja)
router.post('/cerrar', cerrarCaja)
router.post('/completar-corte', completarCorte)

export default router
