import { Router } from 'express'
import { listar, obtener, crear, actualizar, desactivar, eliminar } from '../controllers/ingrediente.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', listar)
router.get('/:id', obtener)
router.post('/', crear)
router.patch('/:id', actualizar)
router.patch('/:id/desactivar', desactivar)
router.delete('/:id', eliminar)

export default router
