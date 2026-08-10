import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth'
import LoginPage from './pages/LoginPage'
import NuevoPedidoPage from './pages/NuevoPedidoPage'
import PedidosPage from './pages/PedidosPage'
import RepartidorHomePage from './pages/RepartidorHomePage'
import DetallePedidoPage from './pages/DetallePedidoPage'
import ConfiguracionMenuPage from './pages/ConfiguracionMenuPage'
import RepartidoresPage from './pages/RepartidoresPage'
import CajaPage from './pages/CajaPage'
import ClientesPage from './pages/ClientesPage'
import InventarioPage from './pages/InventarioPage'
import ReportesPage from './pages/ReportesPage'

function RutaProtegida({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

// Fail-safe (docs/07): cualquier ruta de Administrador es inaccesible para un
// Repartidor — si intenta navegar directo a la URL, se le redirige a "/".
function SoloAdministrador({ children }) {
  const { usuario } = useAuth()
  if (usuario?.tipo === 'Repartidor') return <Navigate to="/" replace />
  return children
}

function PaginaInicio() {
  const { usuario } = useAuth()
  if (usuario?.tipo === 'Repartidor') return <RepartidorHomePage />
  return <PedidosPage />
}

function App() {
  return (
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
  )
}

export default App
