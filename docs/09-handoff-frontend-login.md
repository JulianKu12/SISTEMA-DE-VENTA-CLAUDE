# 09 — Handoff: Frontend Login (Sistema POS)

> **Propósito de este archivo:** reporte de handoff para cambiar de conversación/asistente sin perder contexto (OpenCode ↔ Claude web, o entre chats). Léelo junto con `00-INDICE.md` y `02-stack-tecnico.md`. El backend está terminado; el frontend acaba de empezar con la pantalla de Login.

---

## 1. Qué es el proyecto

Sistema POS (punto de venta) para **loncherías**. Web / PWA instalable en **tablet en orientación horizontal, uso táctil**. Corre 100% local en el negocio.

- **Frontend:** React 19 + Vite 8 + Tailwind CSS 4 (plugin `@tailwindcss/vite`)
- **Backend:** Node.js + Express 5 + Prisma 6 + SQLite (terminado)
- **Formato:** monorepo con npm workspaces (`frontend/` y `backend/`), puertos: frontend `5173`, backend `3001`
- **Proxy Vite:** `frontend/vite.config.js` redirige `/api` → `http://localhost:3001` (el frontend llama rutas relativas `/api/...`)

Scripts (desde la raíz del repo):
- `npm run dev` — corre frontend + backend juntos (concurrently)
- `npm run dev:frontend` / `npm run dev:backend` — por separado
- `npm run build` — build del frontend (Vite)
- `npm run lint` — oxlint (frontend)

## 2. Estado actual del repositorio (NO hay commit aún)

El trabajo de esta sesión está **en el working tree, sin commitear**. Último commit: `b98387b`.

```
 M frontend/index.html
 M frontend/package.json        (se agregó react-router-dom ^7.18.2)
 M frontend/src/App.jsx
 M frontend/src/index.css
 M frontend/src/main.jsx
 M package-lock.json
 D frontend/src/App.css         (boilerplate de Vite eliminado)
 D frontend/src/assets/*        (hero.png, react.svg, vite.svg eliminados)
?? frontend/src/components/
?? frontend/src/context/
?? frontend/src/pages/
?? frontend/src/services/
```

## 3. Backend (ya terminado, referencia rápida)

- **Login:** `POST /api/auth/login` — body `{ usuario, contraseña }` → responde `200 { mensaje, token, usuario: { id, tipo, nombre, usuario } }`
- **Error 401:** `{ message: 'Credenciales inválidas' }` (el frontend muestra ese `message`)
- **Error 400:** `{ message: 'usuario y contraseña son obligatorios' }`
- **JWT:** se guarda en `Usuario.token_sesion`. El resto del `/api` exige `Authorization: Bearer <token>` (middleware `autenticar`), excepto `/api/auth/*` y `/api/health`.
- **Usuarios (seed):** `admin` / `admin123` (tipo `Administrador`). `tipo` puede ser `Administrador` o `Repartidor`.
- **`Usuario.tokenSesion`** se persiste en BD para sesión persistente en el dispositivo.
- Módulos: productos/ingredientes/combos, ventas/inventario, caja/gastos/devoluciones, pedidos/clientes, roles. Ver `docs/03` a `docs/07`.

## 4. Decisiones tomadas en esta sesión (importantes para continuar)

1. **Tailwind CSS v4 → NO existe `tailwind.config.js`.** La configuración de tema se hace vía `@theme` en CSS (`frontend/src/index.css`). Es la convención oficial de v4 (que es la versión instalada). No intentar crear `tailwind.config.js`.
2. **Navegación: `react-router-dom` v7.18.2** (elegido por el usuario). URLs: `/login` y `/` (el `/` se reemplazará luego por el panel de pedidos).
3. **Estado global de auth:** React Context + `localStorage`, sin librerías extra. Claves: `pos.token` y `pos.usuario`.
4. **Componentes UI reutilizables** creados desde el inicio para mantener consistencia Cupertino en todas las pantallas futuras.

## 5. Sistema de diseño Cupertino (tokens en `frontend/src/index.css`)

Bloque `@theme` — reutilizable en toda la app con clases utilitarias Tailwind:

| Token | Valor | Utilidades generadas |
|---|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | fuente base de `body` |
| `--color-surface` | `#f2f2f7` | `bg-surface` (fondo general gris clarito) |
| `--color-card` | `#ffffff` | `bg-card` (tarjetas/contenedores) |
| `--color-input` | `#e5e5ea` | `bg-input` (fondo de inputs gris clarito) |
| `--color-ink` | `#1c1c1e` | `text-ink` (texto primario iOS) |
| `--color-muted` | `#8e8e93` | `text-muted` (texto secundario gris medio) |
| `--color-accent` | `#007aff` | `bg-accent`, `text-accent`, `ring-accent`… (azul iOS, botones primarios/enlaces) |
| `--color-danger` | `#ff3b30` | `text-danger`, `bg-danger/10` (errores rojo iOS) |
| `--shadow-card` | `0 8px 24px rgb(0 0 0/6%), 0 2px 8px rgb(0 0 0/4%)` | `shadow-card` (sombra suave) |

Base (`@layer base`): `body` con `background-color: var(--color-surface)`, color `--color-ink`, `font-family: var(--font-sans)`, `color-scheme: light`, antialiasing.

**Convenciones visuales para TODAS las pantallas:**
- Fondo: `bg-surface`. Tarjetas: `bg-card` + `rounded-2xl`/`rounded-3xl` + `shadow-card`
- Botones primarios: `bg-accent text-white` + `rounded-3xl` + `active:scale-[0.97]` (efecto presionado)
- Inputs: `bg-input` (sin borde duro), `rounded-2xl`, padding generoso táctil (`px-5 py-4`), foco con `ring-2 ring-accent/40`
- Objetivos táctiles grandes: botones `min-h-14`, diseñado para tablet horizontal táctil

## 6. Estructura de archivos del frontend

```
frontend/
├── index.html                  (lang="es", <title>Sistema POS</title>)
├── package.json                (react-router-dom ^7.18.2 agregado)
├── vite.config.js              (puerto 5173, proxy /api → 3001)
└── src/
    ├── main.jsx                (BrowserRouter + AuthProvider + <App/>)
    ├── App.jsx                 (rutas /login, / protegida, * → /)
    ├── index.css               (@theme Cupertino + base)
    ├── components/ui/
    │   ├── Button.jsx          (variantes primary/secondary, tamaños lg/md, active:scale-[0.97])
    │   └── Input.jsx           (label + rightElement, estilo Cupertino, foco con ring)
    ├── context/
    │   ├── authContext.js      (exporta `AuthContext` = createContext(null))
    │   ├── AuthProvider.jsx    (token/usuario en localStorage, login/logout)
    │   └── useAuth.js          (hook useAuth(), tira error si no hay provider)
    ├── pages/
    │   ├── LoginPage.jsx
    │   └── WelcomePage.jsx     (página "Bienvenido" temporal, protegida)
    └── services/
        └── auth.js             (iniciarSesion() → fetch POST /api/auth/login)
```

> Nota de arquitectura: se separaron `authContext.js` / `AuthProvider.jsx` / `useAuth.js` en 3 archivos **a propósito**: la regla de oxlint `react/only-export-components` (warn) exige que un archivo que exporta un componente no exporte también hooks/funciones, para que funcione Fast Refresh. Mantener este patrón en el futuro (no volver a juntar hook + provider).

## 7. Detalle de implementación

### `src/services/auth.js`
```js
export async function iniciarSesion({ usuario, contraseña }) {
  const respuesta = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, contraseña }),
  })
  if (!respuesta.ok) {
    let mensaje = 'No se pudo conectar con el servidor. Intenta de nuevo.'
    try {
      const datos = await respuesta.json()
      if (datos?.message) mensaje = datos.message
    } catch {}
    throw new Error(mensaje)
  }
  return respuesta.json()
}
```

### `src/context/AuthProvider.jsx` (resumen)
- `token` y `usuario` se inicializan leyendo `localStorage` (`pos.token`, `pos.usuario`).
- `login({ usuario, contraseña })` → llama `iniciarSesion`, guarda token+usuario en `localStorage` y en estado.
- `logout()` → borra `localStorage` y estado.
- Expone `{ token, usuario, login, logout }`.

### `src/App.jsx` (rutas)
- `/login` → `LoginPage` (si ya hay token, `Navigate to="/"`)
- `/` → `RutaProtegida` (si NO hay token, `Navigate to="/login"`) envuelve a `WelcomePage`
- `*` → `Navigate to="/"`

### `src/pages/LoginPage.jsx` (pantalla terminada)
- Header centrado: icono redondeado azul + título "Sistema POS" + subtítulo "Inicia sesión para continuar"
- Formulario en tarjeta blanca (`rounded-3xl shadow-card`, `max-w-md`)
- Campo **Usuario** (`autoComplete="username"`, requerido)
- Campo **Contraseña** (`type` password/text alternable) con botón de ojo SVG inline (mostrar/ocultar, `aria-label`)
- Banner de error rojo (`bg-danger/10 text-danger`, `role="alert"`) cuando falla el login (muestra el `message` del backend)
- Botón grande "Iniciar sesión" (`w-full`), mientras carga: deshabilitado + texto "Ingresando…"
- Al éxito: `navigate('/', { replace: true })`

### `src/pages/WelcomePage.jsx` (placeholder)
- Centra "Bienvenido" + nombre del usuario logueado + botón "Cerrar sesión" (`variant="secondary"`).
- **Esta pantalla será reemplazada por el panel de pedidos (siguiente paso).**

### `src/components/ui/Button.jsx`
- Props: `variant` (`primary` | `secondary`), `size` (`lg` | `md`), `type`, `className`, resto se pasan al `<button>`.
- Base: `rounded-3xl`, `font-semibold`, `transition`, `active:scale-[0.97]`, `disabled:opacity-50`, foco `focus-visible:ring-2 ring-accent/40`.

### `src/components/ui/Input.jsx`
- Props: `label`, `rightElement` (para el botón ojo, etc.), `id`, resto se pasan al `<input>`.
- `bg-input rounded-2xl px-5 py-4`, foco `ring-2 ring-accent/40`, padding extra a la derecha si hay `rightElement`.

## 8. Cómo probar / verificar

1. `npm run dev` (o `npm run dev:frontend` + `npm run dev:backend`)
2. Abrir `http://localhost:5173` → redirige a `/login`
3. Ingresar `admin` / `admin123` → redirige a `/` ("Bienvenido")
4. Credenciales incorrectas → banner rojo "Credenciales inválidas"
5. Recargar con sesión activa → sigue logueado (localStorage)
6. Verificación: `npm run lint` (oxlint, sin warnings) y `npm run build` (Vite, exitoso)

**Verificación real hecha:** se levantó el backend y se probó el endpoint `POST /api/auth/login` con `admin/admin123` → `200` con token y datos de usuario. Los campos del request deben enviarse exactamente como `usuario` y `contraseña` (con ñ), en UTF-8.

> Gotcha de PowerShell 5.1 (solo para pruebas manuales por consola): `Invoke-RestMethod` codifica el body con acentos mal, produciendo 400. Usar `curl.exe` con un archivo JSON UTF-8 si se prueba el login desde la terminal. No afecta al frontend (fetch desde JS usa UTF-8 correcto).

## 9. Siguiente paso (pendiente)

- **Reemplazar `WelcomePage` (`/`) por el panel de pedidos** manteniendo el estilo Cupertino (reutilizar tokens `@theme`, `Button`, `Input`).
- Definir en `docs/08-lista-tareas.md` el orden de las siguientes pantallas (pedidos, configuración, etc.).
- Cuando el usuario lo pida: commit de todo el working tree descrito en la sección 2.

## 10. Reglas del proyecto que NO se deben olvidar

- Leer SIEMPRE `docs/00-INDICE.md` antes de tocar funcionalidad (referencias cruzadas entre módulos).
- Todas las pantallas deben respetar: tablet horizontal, táctil, estilo Cupertino consistente.
- Backend: no eliminar entidades con historial (desactivar), precios congelados, inventario auditado con `Movimiento_Inventario`.
