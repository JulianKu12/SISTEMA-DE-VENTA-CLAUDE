import { createTestPrisma } from './prisma/require-test-db.js';
const prisma = createTestPrisma();
const users = await prisma.usuario.findMany({ select: { usuario: true, tipo: true, contraseña: true } });
console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();