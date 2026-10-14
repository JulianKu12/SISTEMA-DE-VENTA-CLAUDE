# Frontend — Sistema POS

Este módulo es la interfaz web del sistema POS para loncherías.

## Stack

- React 19
- Vite 8
- React Router DOM
- Tailwind CSS 4

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Estructura principal

- `src/pages/`: pantallas del sistema
- `src/components/`: componentes reutilizables
- `src/context/`: estado global de autenticación y configuración
- `src/services/`: clientes HTTP hacia el backend

## Reglas importantes

- Las rutas privadas requieren token válido
- Los administradores tienen acceso a la gestión completa
- Los repartidores solo tienen acceso a flujos limitados
- El sistema usa carga diferida (lazy loading) para reducir el bundle inicial y mejorar el rendimiento

## Ejecución local

```bash
cd frontend
npm install
npm run dev
```

La app quedará disponible por defecto en `http://localhost:5173`.
