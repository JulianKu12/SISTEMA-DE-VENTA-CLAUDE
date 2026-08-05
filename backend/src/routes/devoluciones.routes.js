import { Router } from 'express'
import { crearDevolucion, listarDevoluciones } from '../controllers/devoluciones.controller.js'

const router = Router()

router.get('/', listarDevoluciones)
router.post('/', crearDevolucion)

export default router