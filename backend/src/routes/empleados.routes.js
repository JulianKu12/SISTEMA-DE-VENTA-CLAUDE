import { Router } from 'express'
import { listar, obtener, crear, actualizar, eliminar } from '../controllers/empleados.controller.js'

const router = Router()

router.get('/', listar)
router.post('/', crear)
router.get('/:id', obtener)
router.patch('/:id', actualizar)
router.delete('/:id', eliminar)

export default router
