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
npm run db:backup     # Crea y verifica un respaldo manual
npm run db:restore -- "backups/pos-AAAA-MM-DDTHH-MM-SS-sssZ.db"  # Restaura un respaldo

# Seed
npm run db:seed           # Administrador inicial (interactivo)
npm run db:seed:pruebas   # Datos de prueba (desarrollo)

# Tests
npm test                  # Ejecuta smoke e integración del backend con una BD temporal
```

La suite cubre autenticación, acceso de caja, entradas y reversión transaccional
de inventario, ventas con stock insuficiente, pedidos pagados en mostrador y
cálculo del efectivo esperado al cierre. La base de datos temporal se elimina
al terminar; no se utiliza `dev.db`.

## Prueba E2E de venta e inventario

Desde la raíz del monorepo, instala Chromium una vez y ejecuta el recorrido
automatizado en navegador:

```bash
npx playwright install chromium
npm run test:e2e
```

La prueba crea una base SQLite con nombre aleatorio dentro de `backend/prisma/`,
la prepara con datos ficticios y la elimina al finalizar. No inicia el
scheduler de respaldos ni accede a `dev.db`. El flujo crea un producto con
receta desde la interfaz, registra un pedido y comprueba el stock resultante.

## Logs y monitoreo

El backend escribe eventos JSON de una línea a stdout (y errores a stderr), con
marca de tiempo, nivel y nombre de evento. Las solicitudes incluyen un
`requestId` generado por el servidor, disponible también en la cabecera
`X-Request-Id`; los logs de acceso registran método, ruta sin query, estado y
duración. No se registran cuerpos, cabeceras, tokens ni mensajes/stack de errores
internos.

`GET /api/health` es un chequeo de vida del proceso. Para comprobar además la
conexión con SQLite, usa `GET /api/health/ready`: responde `200` cuando la base
está disponible y `503` cuando no lo está. Ambos endpoints son públicos.

## Respaldos y recuperación SQLite

Al arrancar el backend se crea un respaldo verificado y, mientras el proceso
siga ejecutándose, se repite cada 24 horas. `VACUUM INTO` produce una copia
consistente aunque SQLite esté en uso. Los respaldos se guardan por defecto en
`backend/backups/`; se pueden cambiar con `BACKUP_DIR` y el intervalo con
`BACKUP_INTERVAL_HOURS`. No se eliminan respaldos automáticamente.

También puedes crear uno manualmente:

```bash
npm run db:backup
```

Para recuperar datos, **detén el backend primero** y ejecuta el comando indicando
la ruta de un respaldo. El proceso valida la integridad, pide escribir
`RESTAURAR`, crea y conserva una copia del estado actual antes de reemplazar la
base, y verifica el archivo restaurado:

```bash
npm run db:restore -- "backups/pos-2026-10-12T09-30-00-000Z.db"
```

Los archivos de respaldo contienen datos de ventas, clientes y usuarios:
mantén la carpeta protegida, fuera del control de versiones, y copia respaldos
periódicamente a otro dispositivo o ubicación segura. La copia local no protege
contra pérdida o daño del equipo.

## Variables de entorno (.env)

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="tu_secreto_muy_largo_y_seguro"
RATE_LIMIT_GENERAL_MAX=10000
RATE_LIMIT_LOGIN_MAX=100
```

En producción configura `NODE_ENV=production`, un `JWT_SECRET` aleatorio de al
menos 32 caracteres y `DATABASE_URL` apuntando a un archivo SQLite persistente
(no `dev.db` ni `test.db`). `CORS_ORIGIN` es obligatorio en producción y debe
contener uno o más orígenes HTTP(S) exactos, separados por comas; no admite
rutas ni `*`. Los límites deben ser enteros positivos; en producción el máximo
es 20 intentos fallidos de login por ventana y 1000 solicitudes por minuto en
el resto de la API. Si no se personalizan, se aplican los valores seguros por
defecto: 5 y 100, respectivamente.

`PORT` debe estar entre 1 y 65535. `BACKUP_INTERVAL_HOURS` debe ser mayor que 0
y no superar 8760 horas. Una configuración inválida detiene el arranque con un
mensaje explícito; los límites más altos que los valores de producción solo se
permiten en desarrollo y pruebas.

> **Nota**: `node --watch` (usado en `npm run dev`) recarga archivos `.js` automáticamente **PERO NO recarga variables de entorno** del `.env`. Para cambios en `.env`, reinicia el proceso completo (Ctrl+C y `npm run dev` de nuevo).