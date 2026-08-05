import { Router } from 'express'
import healthRoutes from './health.routes.js'
import ingredienteRoutes from './ingrediente.routes.js'
import productoRoutes from './producto.routes.js'
import modificadorRoutes from './modificador.routes.js'
import comboRoutes from './combo.routes.js'
import ventaRoutes from './ventas.routes.js'
import inventarioRoutes from './inventario.routes.js'
import cajaRoutes from './caja.routes.js'
import gastosRoutes from './gastos.routes.js'
import devolucionesRoutes from './devoluciones.routes.js'
import clientesRoutes from './clientes.routes.js'
import empleadosRoutes from './empleados.routes.js'
import configRoutes from './config.routes.js'
import pedidosRoutes from './pedidos.routes.js'

const router = Router()

router.use('/', healthRoutes)
router.use('/ingredientes', ingredienteRoutes)
router.use('/productos', productoRoutes)
router.use('/modificadores', modificadorRoutes)
router.use('/combos', comboRoutes)
router.use('/ventas', ventaRoutes)
router.use('/inventario', inventarioRoutes)
router.use('/caja', cajaRoutes)
router.use('/gastos', gastosRoutes)
router.use('/devoluciones', devolucionesRoutes)
router.use('/clientes', clientesRoutes)
router.use('/empleados', empleadosRoutes)
router.use('/config', configRoutes)
router.use('/pedidos', pedidosRoutes)

export default router