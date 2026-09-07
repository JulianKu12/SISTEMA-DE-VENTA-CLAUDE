import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({ datasources: { db: { url: 'file:./sec_test.db' } } })

async function getStock(productoId) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId } })
  return agg._sum.cantidad ?? 0
}

async function test() {
  // Clean up first - correct order to avoid FK constraints
  await prisma.movimiento_Inventario.deleteMany()
  await prisma.pedido_Producto_Modificador.deleteMany()
  await prisma.pedido_Producto_Mitad.deleteMany()
  await prisma.pedido_Producto.deleteMany()
  await prisma.venta_Producto_Modificador.deleteMany()
  await prisma.venta_Producto_Mitad.deleteMany()
  await prisma.venta_Producto.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.devolucion.deleteMany()
  await prisma.venta.deleteMany()
  await prisma.combo_Producto.deleteMany()
  await prisma.combo.deleteMany()
  await prisma.producto_Modificador.deleteMany()
  await prisma.modificador.deleteMany()
  await prisma.producto_Ingrediente.deleteMany()
  await prisma.producto.deleteMany()
  await prisma.ingrediente.deleteMany()
  await prisma.gasto.deleteMany()
  await prisma.dia_Operativo.deleteMany()
  await prisma.configuracion.deleteMany()
  await prisma.cliente_Referencia.deleteMany()
  await prisma.cliente.deleteMany()
  await prisma.empleado.deleteMany()
  await prisma.usuario.deleteMany({ where: { NOT: { usuario: 'admin_test6' } } })
  
  // Setup
  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin_test6' },
    update: {},
    create: { tipo: 'Administrador', usuario: 'admin_test6', contraseña: '$2b$10$test' },
  })
  
  const harina = await prisma.ingrediente.create({
    data: { nombre: 'Harina6', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 2 },
  })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  
  const torta = await prisma.producto.create({ data: { nombre: 'Torta6', precio: 25, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: harina.id, cantidad: 2 } })
  
  const coca = await prisma.producto.create({ data: { nombre: 'Coca6', precio: 15, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  
  console.log('Initial coca stock:', await getStock(coca.id))
  
  // Simulate the test sequence using ONLY fields that don't have FK constraints
  // p1: 2 coca, Pagado
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Salida_venta', cantidad: -2 } })
  console.log('After p1 (2 coca sold):', await getStock(coca.id))
  
  // p2: 1 coca, Pendiente_pago (reserva)
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  console.log('After p2 reserva (1 coca):', await getStock(coca.id))
  
  // p3: 1 coca, Pendiente_pago (reserva)
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  console.log('After p3 reserva (1 coca):', await getStock(coca.id))
  
  // p4: 1 coca, Pendiente_pago (reserva)
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  console.log('After p4 reserva (1 coca):', await getStock(coca.id))
  
  // pAviso: 1 coca, created then cancelled WITHOUT return
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  console.log('After pAviso reserva (1 coca):', await getStock(coca.id))
  // cancelled without return - no positive movement
  
  // p1 cancelled WITH return: +2
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Cancelacion_regreso', cantidad: 2 } })
  console.log('After p1 cancel with return (+2):', await getStock(coca.id))
  
  // p2 paid - no additional discount
  console.log('After p2 paid (no change):', await getStock(coca.id))
  
  // Now create combo with 1 coca
  const combo = await prisma.combo.create({ data: { nombre: 'Combo Pedido', precioEspecial: 35 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: torta.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: coca.id, cantidad: 1 } })
  
  // Reserve for combo
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  console.log('After combo reserva (1 coca):', await getStock(coca.id))
  
  // Check what the test expects: 5
  const finalStock = await getStock(coca.id)
  console.log('\nExpected: 5, Actual:', finalStock)
  console.log(finalStock === 5 ? 'PASS' : 'FAIL')
}

test().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect() })