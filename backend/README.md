# Backend - Sistema POS para Loncherías

API REST con Express + Prisma + SQLite.

## Instalación

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
```

## Seed inicial (primera instalación)

**IMPORTANTE**: El seed crea el único usuario Administrador del sistema. Se ejecuta de forma interactiva pidiendo credenciales por consola.

```bash
cd backend
npm run db:seed
# o equivalentemente:
npx prisma db seed
```

### Flujo del seed:

1. **Verifica si ya existe un Administrador** en la BD:
   - Si existe: muestra `Ya existe un Administrador ("usuario"). No se creará otro.` y sale sin hacer nada.
   - Si no existe: pasa al paso 2.

2. **Pide credenciales por consola**:
   ```
   === Crear Administrador inicial ===
   Usuario: tu_usuario
   Contraseña (mínimo 8 caracteres): tu_contraseña_segura
   ```

3. **Valida**:
   - Usuario no vacío
   - Contraseña mínimo 8 caracteres

4. **Crea el usuario** con contraseña hasheada (bcrypt) y muestra:
   ```
   Usuario Administrador creado: usuario="tu_usuario" (id=1).
   Guarda estas credenciales de forma segura.
   ```

### Idempotencia

El seed es **idempotente**: se puede ejecutar múltiples veces. Si ya hay un Administrador, no crea duplicados ni pide credenciales de nuevo.

## Seed de pruebas (solo desarrollo)

Para poblar la BD con datos de prueba (ingredientes, productos, combos, etc.):

```bash
npm run db:seed:pruebas
```

Esto usa `prisma/seed-pruebas.js` y **no modifica** el usuario Administrador.

## Comandos útiles

```bash
# Desarrollo (con --watch, recarga al cambiar archivos .js)
npm run dev

# Producción
npm start

# Base de datos
npm run db:generate   # Genera Prisma Client
npm run db:push       # Sincroniza schema con BD (dev)
npm run db:migrate    # Migraciones (producción)
npm run db:studio     # Interfaz visual Prisma Studio

# Seed
npm run db:seed           # Administrador inicial (interactivo)
npm run db:seed:pruebas   # Datos de prueba (desarrollo)
```

## Variables de entorno (.env)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="tu_secreto_muy_largo_y_seguro"
RATE_LIMIT_GENERAL_MAX=10000
RATE_LIMIT_LOGIN_MAX=100
```

> **Nota**: `node --watch` (usado en `npm run dev`) recarga archivos `.js` automáticamente **PERO NO recarga variables de entorno** del `.env`. Para cambios en `.env`, reinicia el proceso completo (Ctrl+C y `npm run dev` de nuevo).