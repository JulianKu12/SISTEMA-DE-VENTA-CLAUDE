import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const users = await prisma.usuario.findMany({ select: { usuario: true, tipo: true, contraseña: true } });
console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();