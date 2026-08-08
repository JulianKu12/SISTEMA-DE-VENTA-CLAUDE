import { Router } from 'express'
import {
  listar,
  obtener,
  crear,
  actualizar,
  actualizarDisponibilidad,
  desactivar,
  reactivar,
  eliminar,
  asociarModificador,
  desasociarModificador,
} from '../controllers/producto.controller.js'
import { soloAdministrador } from '../middlewares/authz.middleware.js'

const router = Router()

router.use(soloAdministrador)

router.get('/', listar)
router.get('/:id', obtener)
router.post('/', crear)
router.patch('/:id', actualizar)
router.patch('/:id/disponibilidad', actualizarDisponibilidad)
router.patch('/:id/desactivar', desactivar)
router.patch('/:id/reactivar', reactivar)
router.delete('/:id', eliminar)
router.post('/:productoId/modificadores', asociarModificador)
router.delete('/:productoId/modificadores/:modificadorId', desasociarModificador)

export default router
