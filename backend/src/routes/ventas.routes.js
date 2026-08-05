import { Router } from 'express'
import { crearVenta } from '../controllers/ventas.controller.js'
import { repartidorNoCobrarVenta } from '../middlewares/authz.middleware.js'

const router = Router()

router.post('/', repartidorNoCobrarVenta, crearVenta)

export default router
