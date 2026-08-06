// Migración única: hashea las contraseñas que quedaron en texto plano en la
// base de desarrollo (previo al cambio a bcrypt). Es idempotente: solo toca
// los Usuario cuya contraseña NO empiece con el prefijo bcrypt "$2".
//
// Cómo correrla:
//   cd backend
//   node prisma/hash-passwords.js
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const usuarios = await prisma.usuario.findMany()
  let hasheados = 0
  for (const u of usuarios) {
    const contraseña = u.contraseña || ''
    if (contraseña.startsWith('$2')) continue
    await prisma.usuario.update({
      where: { id: u.id },
      data: { contraseña: await bcrypt.hash(contraseña, 10) },
    })
    hasheados++
    console.log(`  hasheada contraseña de usuario "${u.usuario}" (id=${u.id})`)
  }
  console.log(hasheados === 0 ? 'No había contraseñas en texto plano. Nada que hacer.' : `${hasheados} contraseña(s) hasheadas.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
