// Seed del Módulo 07 (docs/07-modulo-roles.md): crea, SI NO EXISTE YA, el
// único Usuario tipo=Administrador del sistema. Es idempotente: si ya existe
// un Administrador, no crea un segundo.
//
// Cómo correrlo:
//   cd backend
//   npm run db:seed        (o: npx prisma db seed)
//
// Credenciales de ejemplo (CAMBIARLAS DESPUÉS):
//   usuario:    admin
//   contraseña: admin123
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const existente = await prisma.usuario.findFirst({ where: { tipo: 'Administrador' } })
  if (existente) {
    console.log(`Ya existe un usuario Administrador ("${existente.usuario}"). No se crea otro.`)
    return
  }

  const hash = await bcrypt.hash('admin123', 10)
  const admin = await prisma.usuario.create({
    data: {
      tipo: 'Administrador',
      nombre: 'Administrador',
      usuario: 'admin',
      contraseña: hash,
    },
  })
  console.log(`Usuario Administrador creado: usuario="admin", contraseña="admin123" (id=${admin.id}).`)
  console.log('IMPORTANTE: cambia la contraseña por defecto después del primer uso.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
