import { useEffect } from 'react'

const VARIANTES_BOTON = {
  primary: 'bg-accent text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] active:bg-accent/85',
  danger: 'bg-danger text-white shadow-[0_4px_14px_rgb(255_59_48/0.35)] active:bg-danger/85',
}

function ConfirmModal({
  abierto,
  titulo,
  mensaje,
  confirmarEtiqueta = 'Confirmar',
  cancelarEtiqueta = 'Cancelar',
  extraEtiqueta,
  onExtra,
  variante = 'primary',
  onConfirmar,
  onCancelar,
}) {
  // Botón neutral opcional (extraEtiqueta/onExtra): cierra el modal sin ejecutar
  // la acción. Cuando existe, Escape y el clic en el fondo también cierran sin
  // ejecutar nada (comportamiento de "cancelar a secas").
  const cerrar = onExtra || onCancelar

  useEffect(() => {
    if (!abierto) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') cerrar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [abierto, cerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={cerrar}
      />
      <div className="relative w-full max-w-md animate-[sheet-up_280ms_ease-out] rounded-3xl bg-card p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink">{titulo}</h2>
        {mensaje && <p className="mt-2 text-sm leading-relaxed text-muted">{mensaje}</p>}
        <div className="mt-6 flex gap-3">
          {extraEtiqueta && (
            <button
              type="button"
              onClick={cerrar}
              className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {extraEtiqueta}
            </button>
          )}
          <button
            type="button"
            onClick={onCancelar}
            className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {cancelarEtiqueta}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className={`inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-semibold transition duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.97] ${VARIANTES_BOTON[variante]}`}
          >
            {confirmarEtiqueta}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal