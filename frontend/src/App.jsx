import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth'
import LoginPage from './pages/LoginPage'
import PedidosPage from './pages/PedidosPage'
import PlaceholderPage from './pages/PlaceholderPage'

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
            <PlaceholderPage titulo="Nuevo Pedido" />
          </RutaProtegida>
        }
      />
      <Route
        path="/pedidos/:id"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Detalle de Pedido" />
          </RutaProtegida>
        }
      />
      <Route
        path="/configuracion"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Configuración de menú" />
          </RutaProtegida>
        }
      />
      <Route
        path="/inventario"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Inventario" />
          </RutaProtegida>
        }
      />
      <Route
        path="/clientes"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Clientes" />
          </RutaProtegida>
        }
      />
      <Route
        path="/repartidores"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Repartidores" />
          </RutaProtegida>
        }
      />
      <Route
        path="/caja"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Caja" />
          </RutaProtegida>
        }
      />
      <Route
        path="/gastos"
        element={
          <RutaProtegida>
            <PlaceholderPage titulo="Gastos" />
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
