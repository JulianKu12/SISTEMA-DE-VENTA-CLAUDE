// Seed del Módulo 07 (docs/07-modulo-roles.md): crea, SI NO EXISTE YA, el
// único Usuario tipo=Administrador del sistema. Es idempotente: si ya existe
// un Administrador, no crea un segundo.
//
// Cómo correrlo:
//   cd backend
//   npm run db:seed        (o: npx prisma db seed)
//
// Se pedirá usuario y contraseña por consola (mínimo 8 caracteres).
import readline from 'readline'
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkExistingAdmin() {
  return prisma.usuario.findFirst({ where: { tipo: 'Administrador' } })
}

async function createAdmin(usuario, contraseña) {
  const hash = await bcrypt.hash(contraseña, 10)
  return prisma.usuario.create({
    data: {
      tipo: 'Administrador',
      nombre: 'Administrador',
      usuario: usuario.trim(),
      contraseña: hash,
    },
  })
}

async function main() {
  const existente = await checkExistingAdmin()
  if (existente) {
    console.log(`Ya existe un Administrador ("${existente.usuario}"). No se creará otro.`)
    return
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  function preguntar(texto) {
    return new Promise((resolve) => rl.question(texto, resolve))
  }

  console.log('=== Crear Administrador inicial ===')
  const usuario = await preguntar('Usuario: ')
  if (!usuario.trim()) {
    console.error('Error: el usuario no puede estar vacío.')
    rl.close()
    process.exit(1)
  }

  const contraseña = await preguntar('Contraseña (mínimo 8 caracteres): ')
  if (contraseña.length < 8) {
    console.error('Error: la contraseña debe tener al menos 8 caracteres.')
    rl.close()
    process.exit(1)
  }

  const admin = await createAdmin(usuario, contraseña)
  console.log(`\nUsuario Administrador creado: usuario="${usuario.trim()}" (id=${admin.id}).`)
  console.log('Guarda estas credenciales de forma segura.')
  
  rl.close()
}

async function run() {
  try {
    await main()
  } catch (e) {
    console.error(e)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

run()