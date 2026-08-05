import { Router } from 'express'
import { registrarEntrada, registrarAjuste, consultarStock } from '../controllers/inventario.controller.js'

const router = Router()

router.get('/stock', consultarStock)
router.post('/entrada', registrarEntrada)
router.post('/ajuste', registrarAjuste)

export default router