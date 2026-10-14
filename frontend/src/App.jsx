import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const NuevoPedidoPage = lazy(() => import('./pages/NuevoPedidoPage'))
const PedidosPage = lazy(() => import('./pages/PedidosPage'))
const RepartidorHomePage = lazy(() => import('./pages/RepartidorHomePage'))
const DetallePedidoPage = lazy(() => import('./pages/DetallePedidoPage'))
const ConfiguracionMenuPage = lazy(() => import('./pages/ConfiguracionMenuPage'))
const RepartidoresPage = lazy(() => import('./pages/RepartidoresPage'))
const CajaPage = lazy(() => import('./pages/CajaPage'))
const ClientesPage = lazy(() => import('./pages/ClientesPage'))
const InventarioPage = lazy(() => import('./pages/InventarioPage'))
const ReportesPage = lazy(() => import('./pages/ReportesPage'))

function RutaProtegida({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

// Las rutas administrativas requieren el rol exacto; los roles desconocidos
// también quedan fuera por seguridad ante valores de sesión incompletos.
function SoloAdministrador({ children }) {
  const { usuario } = useAuth()
  if (usuario?.tipo !== 'Administrador') return <Navigate to="/" replace />
  return children
}

function AccesoNoAutorizado() {
  const { logout } = useAuth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <h1 className="text-xl font-bold text-ink">Acceso no autorizado</h1>
      <p className="max-w-md text-sm text-muted">
        Tu sesión no tiene un tipo de usuario válido para acceder a esta aplicación.
      </p>
      <button
        type="button"
        onClick={logout}
        className="rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white"
      >
        Cerrar sesión
      </button>
    </main>
  )
}

function PaginaInicio() {
  const { usuario } = useAuth()
  if (usuario?.tipo === 'Repartidor') return <RepartidorHomePage />
  if (usuario?.tipo === 'Administrador') return <PedidosPage />
  return <AccesoNoAutorizado />
}

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
          Cargando aplicación...
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RutaProtegida>
              <PaginaInicio />
            </RutaProtegida>
          }
        />
        <Route
          path="/pedidos/nuevo"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <NuevoPedidoPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/pedidos/:id"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <DetallePedidoPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/configuracion"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <ConfiguracionMenuPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/inventario"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <InventarioPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/clientes"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <ClientesPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/repartidores"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <RepartidoresPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/caja"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <CajaPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/gastos"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <CajaPage pestanaInicial="gastos" />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route
          path="/reportes"
          element={
            <RutaProtegida>
              <SoloAdministrador>
                <ReportesPage />
              </SoloAdministrador>
            </RutaProtegida>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
