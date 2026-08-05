# 02 — Stack Tecnológico

> Ver `00-INDICE.md` para el mapa completo. Este documento define CON QUÉ se construye todo lo descrito en `03`, `04`, `05`, `06` y `07`.

## Stack definitivo

| Capa | Tecnología |
|---|---|
| Frontend | React (con Vite) + Tailwind CSS |
| Backend | Node.js + Express |
| Base de datos | SQLite |
| ORM | Prisma |
| Formato de entrega | Web / PWA (instalable en tablet como acceso directo, sin tienda de aplicaciones) |
| Hosting | Local en el negocio (sin necesidad de pagar hosting). Opcional a futuro: Render o Railway (planes gratuitos) solo si se requiere acceso remoto a reportes |
| Control de versiones | Git + GitHub |

## Por qué este stack

- Todo en JavaScript (frontend y backend), reduce la curva de aprendizaje para el desarrollador
- Es el stack más común actualmente, por lo que las IAs de código (incluyendo OpenCode) lo generan con alta calidad y buena documentación de referencia
- 100% gratuito, sin licencias ni suscripciones
- SQLite facilita mantener el sistema funcionando sin depender de internet, y deja abierta la posibilidad de implementar offline-first a futuro (ver `01-contexto-negocio.md`, sección "Decisión sobre modo offline", y `08-lista-tareas.md`, Fase 12)

## Tecnologías descartadas y por qué

- **Vercel (para el backend):** su modelo serverless no es compatible con SQLite persistente — cada función se ejecuta en un entorno temporal sin disco persistente confiable. Vercel sí sería viable solo para el frontend, pero separar frontend/backend en distintas plataformas agrega complejidad innecesaria para el tamaño de este proyecto.
- **GitHub Pages:** solo sirve contenido estático (HTML/CSS/JS puro), no puede correr un backend ni una base de datos. El sistema necesita ambos.
- **Render/Railway como necesidad inmediata:** el sistema corre localmente en el negocio, sin depender de internet. Estas plataformas quedan como opción futura y opcional, solo si se requiere acceso remoto a reportes.

## Cómo esto afecta la implementación de cada módulo

- **Todas las entidades descritas en `03`, `04`, `05`, `06` y `07`** se implementan como modelos de **Prisma**, en un único archivo `schema.prisma`, y viven en un solo archivo de base de datos SQLite.
- **Toda comunicación entre frontend y backend** se hace vía API REST (Express), consumida desde React.
- El diseño de pantallas (wireframes, construidos por el desarrollador en Canva por su cuenta) debe respetar Tailwind CSS como sistema de estilos, y estar optimizado para **tablet en orientación horizontal, uso táctil** (ver `01-contexto-negocio.md` para contexto de uso).

## Estado del entorno de desarrollo (al momento de este documento)

- ✅ Node.js, Git y VS Code instalados
- ✅ Repositorio Git creado y conectado a GitHub (`https://github.com/JulianKu12/Sistema-de-ventas`)
- ✅ Primer commit subido (`.gitignore` inicial)
- ✅ Proyecto ubicado fuera de OneDrive (evita conflictos de sincronización con `node_modules`)
- ⏳ Pendiente: estructura de carpetas frontend/backend, instalación de dependencias, configuración de Prisma con el schema completo (ver entidades en `03`, `04`, `05`, `06`, `07`)

## Instrucción para el primer prompt de OpenCode

El primer prompt de desarrollo (estructura base) debe pedir explícitamente:
1. Estructura de carpetas separando frontend y backend (monorepo simple)
2. Frontend: Vite + template React + Tailwind configurado
3. Backend: Node + Express, con estructura organizada (rutas, controladores, modelos)
4. Prisma instalado, apuntando a SQLite local — **sin definir el schema todavía** (el schema completo se arma en un segundo prompt, usando las entidades de los archivos `03` a `07`)
5. Endpoint de prueba `GET /api/health`
6. Scripts de desarrollo en `package.json`
7. `.gitignore` actualizado para este stack (node_modules, .env, dist, archivos `.db` de SQLite)
