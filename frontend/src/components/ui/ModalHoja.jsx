import { useEffect } from 'react'

function IconoEquis() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function ModalHoja({ abierto, titulo, subtitulo, onCerrar, children, ancho = 'max-w-lg' }) {
  useEffect(() => {
    if (!abierto) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCerrar}
      />
      <div
        className={`relative max-h-[88vh] w-full ${ancho} animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card shadow-card`}
      >
        <div className="sticky top-0 z-10 rounded-t-3xl bg-card px-6 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">{titulo}</h2>
              {subtitulo && <p className="mt-0.5 text-sm text-muted">{subtitulo}</p>}
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <IconoEquis />
            </button>
          </div>
        </div>
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}

export default ModalHoja
