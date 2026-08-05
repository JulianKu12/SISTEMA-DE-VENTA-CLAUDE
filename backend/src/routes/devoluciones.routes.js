import { Router } from 'express'
import { crearDevolucion, listarDevoluciones } from '../controllers/devoluciones.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', listarDevoluciones)
router.post('/', crearDevolucion)

export default router
