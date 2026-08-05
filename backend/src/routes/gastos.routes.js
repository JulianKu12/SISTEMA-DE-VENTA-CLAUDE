import { Router } from 'express'
import { crearGasto, listarGastos } from '../controllers/gastos.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', listarGastos)
router.post('/', crearGasto)

export default router
