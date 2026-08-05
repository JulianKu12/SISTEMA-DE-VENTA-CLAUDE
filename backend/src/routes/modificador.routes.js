import { Router } from 'express'
import { listar, obtener, crear, actualizar, desactivar, eliminar } from '../controllers/modificador.controller.js'

const router = Router()

router.get('/', listar)
router.get('/:id', obtener)
router.post('/', crear)
router.patch('/:id', actualizar)
router.patch('/:id/desactivar', desactivar)
router.delete('/:id', eliminar)

export default router