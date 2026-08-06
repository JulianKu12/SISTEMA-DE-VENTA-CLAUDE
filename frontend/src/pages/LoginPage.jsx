import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { useAuth } from '../context/useAuth'

function IconoOjo() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function IconoOjoCerrado() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

function LoginPage() {
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [contraseña, setContraseña] = useState('')
  const [mostrarContraseña, setMostrarContraseña] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  if (token) return <Navigate to="/" replace />

  const manejarEnvio = async (e) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login({ usuario, contraseña })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-white shadow-[0_4px_14px_rgb(0_122_255/0.4)]">
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
            <path d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-11.25 0V21" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-ink">Sistema POS</h1>
        <p className="mt-1 text-muted">Inicia sesión para continuar</p>
      </header>

      <form
        onSubmit={manejarEnvio}
        className="w-full max-w-md rounded-3xl bg-card p-8 shadow-card"
      >
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4m0 4h.01" />
            </svg>
            {error}
          </div>
        )}

        <div className="space-y-5">
          <Input
            id="usuario"
            label="Usuario"
            type="text"
            autoComplete="username"
            placeholder="Ingresa tu usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />

          <Input
            id="contraseña"
            label="Contraseña"
            type={mostrarContraseña ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Ingresa tu contraseña"
            value={contraseña}
            onChange={(e) => setContraseña(e.target.value)}
            required
            rightElement={
              <button
                type="button"
                onClick={() => setMostrarContraseña((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted transition active:text-ink"
                aria-label={
                  mostrarContraseña ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
              >
                {mostrarContraseña ? <IconoOjoCerrado /> : <IconoOjo />}
              </button>
            }
          />
        </div>

        <Button
          type="submit"
          className="mt-6 w-full"
          disabled={cargando}
          aria-busy={cargando}
        >
          {cargando ? 'Ingresando…' : 'Iniciar sesión'}
        </Button>
      </form>
    </main>
  )
}

export default LoginPage
