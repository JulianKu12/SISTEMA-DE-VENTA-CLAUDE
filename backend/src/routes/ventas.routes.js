import { Router } from 'express'
import { crearVenta, listarVentas, reporteNoCobrar } from '../controllers/ventas.controller.js'
import {
  soloAdministrador,
  repartidorNoCobrarVenta,
} from '../middlewares/authz.middleware.js'

const router = Router()

// Reportes completos y auditoría de "No cobrar": solo Administrador (docs/07).
router.get('/no-cobrar', soloAdministrador, reporteNoCobrar)
router.get('/', soloAdministrador, listarVentas)

router.post('/', repartidorNoCobrarVenta, crearVenta)

export default router
