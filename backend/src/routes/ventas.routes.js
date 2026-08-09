import { Router } from 'express'
import {
  crearVenta,
  listarVentas,
  obtenerVenta,
  reporteNoCobrar,
} from '../controllers/ventas.controller.js'
import {
  soloAdministrador,
  repartidorNoCobrarVenta,
} from '../middlewares/authz.middleware.js'

const router = Router()

// Reportes completos y auditoría de "No cobrar": solo Administrador (docs/07).
router.get('/no-cobrar', soloAdministrador, reporteNoCobrar)
router.get('/', soloAdministrador, listarVentas)
router.get('/:id', soloAdministrador, obtenerVenta)

router.post('/', repartidorNoCobrarVenta, crearVenta)

export default router
