import { Router } from 'express'
import healthRoutes from './health.routes.js'
import ingredienteRoutes from './ingrediente.routes.js'
import productoRoutes from './producto.routes.js'
import modificadorRoutes from './modificador.routes.js'
import comboRoutes from './combo.routes.js'
import ventaRoutes from './ventas.routes.js'
import inventarioRoutes from './inventario.routes.js'

const router = Router()

router.use('/', healthRoutes)
router.use('/ingredientes', ingredienteRoutes)
router.use('/productos', productoRoutes)
router.use('/modificadores', modificadorRoutes)
router.use('/combos', comboRoutes)
router.use('/ventas', ventaRoutes)
router.use('/inventario', inventarioRoutes)

export default router