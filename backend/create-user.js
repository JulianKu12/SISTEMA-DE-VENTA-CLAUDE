const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createUser() {
  const usuario = 'prueba';
  const contraseña = '123';
  
  const existe = await prisma.usuario.findUnique({ where: { usuario } });
  if (existe) {
    console.log('El usuario ya existe');
    return;
  }
  
  const hash = await bcrypt.hash(contraseña, 10);
  
  const user = await prisma.usuario.create({
    data: {
      tipo: 'Administrador',
      nombre: 'Usuario Prueba',
      usuario: usuario,
      contraseña: hash,
    },
  });
  
  console.log('Usuario creado:', user.usuario, '(id:', user.id, ')');
}

createUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());