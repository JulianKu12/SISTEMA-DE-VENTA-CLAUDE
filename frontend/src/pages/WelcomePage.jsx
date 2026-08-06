import Button from '../components/ui/Button'
import { useAuth } from '../context/useAuth'

function WelcomePage() {
  const { usuario, logout } = useAuth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-ink">Bienvenido</h1>
      {usuario?.nombre && <p className="text-lg text-muted">{usuario.nombre}</p>}
      <Button variant="secondary" size="md" onClick={logout}>
        Cerrar sesión
      </Button>
    </main>
  )
}

export default WelcomePage
