import { Router } from 'express'
import { registrarEntrada, registrarAjuste, consultarStock } from '../controllers/inventario.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/stock', consultarStock)
router.post('/entrada', registrarEntrada)
router.post('/ajuste', registrarAjuste)

export default router
