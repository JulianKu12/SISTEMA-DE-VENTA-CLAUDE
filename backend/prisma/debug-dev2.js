import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  // Clean
  await prisma.usuario.deleteMany({ where: { usuario: { startsWith: 'admin_test' } } })
  await prisma.dia_Operativo.deleteMany()
  await prisma.venta.deleteMany()
  await prisma.devolucion.deleteMany()
  await prisma.producto.deleteMany()
  await prisma.movimiento_Inventario.deleteMany()
  
  // Create admin
  const admin = await prisma.usuario.create({
    data: { tipo: 'Administrador', usuario: 'admin_test5', contraseña: await bcrypt.hash('x', 10) }
  })
  
  // Create product
  const coca = await prisma.producto.create({ data: { nombre: 'Coca', precio: 15, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  
  // Create caja abierta
  const dia = await prisma.dia_Operativo.create({ data: { fondoInicial: 100, estado: 'Abierto', usuarioId: admin.id } })
  
  // Create venta
  const venta = await prisma.venta.create({
    data: {
      productos: { create: { productoId: coca.id, cantidad: 1, precioCongelado: 15 } },
      metodoPago: 'Tarjeta',
      usuarioId: admin.id,
      diaOperativoId: dia.id,
      total: 15
    }
  })
  
  // Close caja
  await prisma.dia_Operativo.update({ where: { id: dia.id }, data: { estado: 'Cerrado', fechaCierre: new Date(), efectivoContado: 100, diferencia: 0 } })
  
  // Now test devolucion without caja
  const res = await fetch('http://localhost:3001/api/devoluciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // no auth for now
    body: JSON.stringify({ ventaId: venta.id, monto: 5, motivo: 'Otro', medioDevolucion: 'Efectivo', regresaAInventario: false })
  })
  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())