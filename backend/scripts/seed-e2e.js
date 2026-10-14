import bcrypt from 'bcrypt'
import prisma from '../src/models/prisma.js'

try {
  const contraseña = await bcrypt.hash('e2e-test-password', 10)
  const usuario = await prisma.usuario.create({
    data: {
      tipo: 'Administrador',
      nombre: 'Usuario de pruebas E2E',
      usuario: 'e2e-admin',
      contraseña,
    },
  })
  const contraseñaRepartidor = await bcrypt.hash('e2e-courier-password', 10)
  await prisma.usuario.create({
    data: {
      tipo: 'Repartidor',
      nombre: 'Repartidor de pruebas E2E',
      usuario: 'e2e-repartidor',
      contraseña: contraseñaRepartidor,
      empleado: {
        create: { nombre: 'Repartidor de pruebas E2E' },
      },
    },
  })
  const ingrediente = await prisma.ingrediente.create({
    data: {
      nombre: 'Ingrediente E2E',
      unidadMedida: 'pieza',
      stockActual: 10,
      stockMinimoAlerta: 1,
      costoUltimaCompra: 1,
    },
  })

  await prisma.movimiento_Inventario.create({
    data: {
      ingredienteId: ingrediente.id,
      tipoMovimiento: 'Entrada',
      cantidad: 10,
      motivo: 'Otro',
    },
  })
  const ingredienteFlujos = await prisma.ingrediente.create({
    data: {
      nombre: 'Ingrediente flujos E2E',
      unidadMedida: 'pieza',
      stockActual: 100,
      stockMinimoAlerta: 1,
      costoUltimaCompra: 1,
    },
  })
  await prisma.movimiento_Inventario.create({
    data: {
      ingredienteId: ingredienteFlujos.id,
      tipoMovimiento: 'Entrada',
      cantidad: 100,
      motivo: 'Otro',
    },
  })
  await prisma.dia_Operativo.create({
    data: {
      fondoInicial: 100,
      usuarioId: usuario.id,
    },
  })
} finally {
  await prisma.$disconnect()
}
