import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'

function PlaceholderPage({ titulo }) {
  const navigate = useNavigate()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-input text-muted">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8"
          aria-hidden="true"
        >
          <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-ink">{titulo}</h1>
        <p className="mt-1 text-muted">Esta sección se construirá próximamente.</p>
      </div>
      <Button variant="secondary" size="md" onClick={() => navigate('/')}>
        Volver a Pedidos
      </Button>
    </main>
  )
}

export default PlaceholderPage
