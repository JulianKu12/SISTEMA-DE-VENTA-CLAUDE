import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Clean test data
  await prisma.usuario.deleteMany({ where: { usuario: { startsWith: 'admin_test' } } })
  await prisma.usuario.deleteMany({ where: { usuario: { startsWith: 'rep_' } } })
  await prisma.usuario.deleteMany({ where: { usuario: { startsWith: 'ana_' } } })
  await prisma.producto.deleteMany({ where: { nombre: { startsWith: 'Torta' } } })
  await prisma.producto.deleteMany({ where: { nombre: { startsWith: 'Prod' } } })
  await prisma.ingrediente.deleteMany({ where: { nombre: { startsWith: 'Harina' } } })
  await prisma.ingrediente.deleteMany({ where: { nombre: { startsWith: 'Pan' } } })
  await prisma.ingrediente.deleteMany({ where: { nombre: { startsWith: 'Ing' } } })
  await prisma.ingrediente.deleteMany({ where: { nombre: { startsWith: 'Extra' } } })
  await prisma.modificador.deleteMany({ where: { nombre: { startsWith: 'Mod' } } })
  await prisma.combo.deleteMany({ where: { nombre: { startsWith: 'Combo' } } })
  await prisma.cliente.deleteMany({ where: { nombre: { startsWith: 'Ana' } } })
  await prisma.empleado.deleteMany({ where: { nombre: { startsWith: 'Repartidor' } } })
  await prisma.dia_Operativo.deleteMany()
  await prisma.venta.deleteMany()
  await prisma.pedido.deleteMany()
  await prisma.gasto.deleteMany()
  await prisma.devolucion.deleteMany()
  await prisma.movimiento_Inventario.deleteMany()
  await prisma.configuracion.upsert({
    where: { id: 1 },
    create: { id: 1, costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] },
    update: { costoEnvio: 0, repartidorUnico: false, opcionesCambio: [50, 100, 200, 500] }
  })
  console.log('Database cleaned')
}

main().finally(() => prisma.$disconnect())