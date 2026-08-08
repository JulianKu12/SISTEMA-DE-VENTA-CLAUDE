import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth'
import LoginPage from './pages/LoginPage'
import NuevoPedidoPage from './pages/NuevoPedidoPage'
import PedidosPage from './pages/PedidosPage'
import DetallePedidoPage from './pages/DetallePedidoPage'
import ConfiguracionMenuPage from './pages/ConfiguracionMenuPage'
import RepartidoresPage from './pages/RepartidoresPage'
import PlaceholderPage from './pages/PlaceholderPage'
import CajaPage from './pages/CajaPage'
import ClientesPage from './pages/ClientesPage'
import InventarioPage from './pages/InventarioPage'

function RutaProtegida({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RutaProtegida>
            <PedidosPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/pedidos/nuevo"
        element={
          <RutaProtegida>
            <NuevoPedidoPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/pedidos/:id"
        element={
          <RutaProtegida>
            <DetallePedidoPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/configuracion"
        element={
          <RutaProtegida>
            <ConfiguracionMenuPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/inventario"
        element={
          <RutaProtegida>
            <InventarioPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/clientes"
        element={
          <RutaProtegida>
            <ClientesPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/repartidores"
        element={
          <RutaProtegida>
            <RepartidoresPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/caja"
        element={
          <RutaProtegida>
            <CajaPage />
          </RutaProtegida>
        }
      />
      <Route
        path="/gastos"
        element={
          <RutaProtegida>
            <CajaPage pestanaInicial="gastos" />
          </RutaProtegida>
        }
      />
      <Route
        path="/reportes"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Reportes" />
          </RutaProtegida>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
