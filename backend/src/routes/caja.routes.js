import { Router } from 'express'
import { abrirCaja, cerrarCaja, estadoCaja, historialCaja } from '../controllers/caja.controller.js'

const router = Router()

router.get('/estado', estadoCaja)
router.get('/historial', historialCaja)
router.post('/abrir', abrirCaja)
router.post('/cerrar', cerrarCaja)

export default router