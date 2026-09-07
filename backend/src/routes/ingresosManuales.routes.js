import { Router } from 'express'
import { crearIngresoManual, listarIngresosManuales } from '../controllers/ingresosManuales.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', listarIngresosManuales)
router.post('/', crearIngresoManual)

export default router