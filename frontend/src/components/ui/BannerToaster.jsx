import { useEffect, useState } from 'react'

// Panel fijo de avisos (errores y notificaciones) siempre visible arriba de la
// pantalla, sin necesidad de hacer scroll. Complementa los mensajes inline.
// - error        : banner rojo persistente; se puede cerrar (onCerrarError).
// - notificacion : banner verde que se oculta solo tras 4 s.
export default function BannerToaster({ error, notificacion, onCerrarError }) {
  const [notaOculta, setNotaOculta] = useState(false)

  useEffect(() => {
    if (!notificacion) return
    setNotaOculta(false)
    const t = setTimeout(() => setNotaOculta(true), 4000)
    return () => clearTimeout(t)
  }, [notificacion])

  const notaVisible = notificacion && !notaOculta
  if (!error && !notaVisible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] px-4 pt-2 sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-5xl space-y-2">
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-2xl bg-danger/95 px-4 py-3 text-sm font-medium text-white shadow-card"
          >
            <span className="min-w-0">{error}</span>
            {onCerrarError && (
              <button
                type="button"
                onClick={onCerrarError}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded-full p-1 transition hover:bg-white/15 active:scale-95"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}
        {notaVisible && (
          <div className="rounded-2xl bg-green-700/95 px-4 py-3 text-sm font-medium text-white shadow-card">
            {notificacion}
          </div>
        )}
      </div>
    </div>
  )
}