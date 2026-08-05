import { Router } from 'express'
import {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  listarReferencias,
  crearReferencia,
  actualizarReferencia,
  eliminarReferencia,
} from '../controllers/clientes.controller.js'

const router = Router()

router.get('/', listar)
router.post('/', crear)
router.get('/:id', obtener)
router.patch('/:id', actualizar)
router.delete('/:id', eliminar)
router.get('/:id/referencias', listarReferencias)
router.post('/:id/referencias', crearReferencia)
router.patch('/referencias/:referenciaId', actualizarReferencia)
router.delete('/referencias/:referenciaId', eliminarReferencia)

export default router
