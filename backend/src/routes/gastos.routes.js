import { Router } from 'express'
import { crearGasto, listarGastos } from '../controllers/gastos.controller.js'

const router = Router()

router.get('/', listarGastos)
router.post('/', crearGasto)

export default router