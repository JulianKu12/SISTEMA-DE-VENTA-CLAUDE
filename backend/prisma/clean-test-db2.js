import { createTestPrisma } from './require-test-db.js'

const prisma = createTestPrisma()

async function main() {
  // Delete in reverse dependency order
  await prisma.devolucion.deleteMany()
  await prisma.venta_Producto_Modificador.deleteMany()
  await prisma.venta_Producto_Mitad.deleteMany()
  await prisma.venta_Producto.deleteMany()
  await prisma.venta.deleteMany()
  await prisma.pedido_Producto_Modificador.deleteMany()
  await prisma.pedido_Producto_Mitad.deleteMany()
  await prisma.pedido_Producto.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.gasto.deleteMany()
  await prisma.ingresoManual.deleteMany()
  await prisma.movimiento_Inventario.deleteMany()
  await prisma.dia_Operativo.deleteMany()
  await prisma.combo_Producto.deleteMany()
  await prisma.combo.deleteMany()
  await prisma.producto_Modificador.deleteMany()
  await prisma.producto_Ingrediente.deleteMany()
  await prisma.producto.deleteMany()
  await prisma.modificador.deleteMany()
  await prisma.ingrediente.deleteMany()
  await prisma.cliente_Referencia.deleteMany()
  await prisma.cliente.deleteMany()
  await prisma.empleado.deleteMany()
  await prisma.usuario.deleteMany()
  await prisma.configuracion.upsert({
    where: { id: 1 },
    create: { id: 1, costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] },
    update: { costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] }
  })
  console.log('Database cleaned successfully')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())