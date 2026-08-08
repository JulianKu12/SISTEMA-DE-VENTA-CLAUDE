import { Router } from 'express'
import { listar, obtener, crear, actualizar, desactivar, reactivar, eliminar } from '../controllers/combo.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', listar)
router.get('/:id', obtener)
router.post('/', crear)
router.patch('/:id', actualizar)
router.patch('/:id/desactivar', desactivar)
router.patch('/:id/reactivar', reactivar)
router.delete('/:id', eliminar)

export default router
