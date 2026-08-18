import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { useConfiguracion } from '../context/useConfiguracion'

const CLASE_INPUT =
  'w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

function EtiquetaSeccion({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
}

function Interruptor({ activo, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={ariaLabel}
      onClick={() => onChange(!activo)}
      className={`relative h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${
        activo ? 'bg-accent' : 'bg-muted/25'
      }`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-card shadow transition-transform ${
          activo ? 'translate-x-6' : ''
        }`}
      />
    </button>
  )
}

export default function ConfiguracionGeneral({ onNotificacion, onError }) {
  const { config, guardarConfiguracion } = useConfiguracion()
  const [draft, setDraft] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!config) return
    setDraft({
      costoEnvio: String(config.costoEnvio ?? 0),
      opcionesCambio:
        Array.isArray(config.opcionesCambio) && config.opcionesCambio.length > 0
          ? config.opcionesCambio.map(String)
          : ['50', '100', '200', '500'],
      repartidorUnico: Boolean(config.repartidorUnico),
    })
  }, [config])

  if (!draft) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
        <p className="text-sm">Cargando configuración…</p>
      </div>
    )
  }

  const cambiarOpcion = (indice, valor) => {
    setDraft((d) => ({
      ...d,
      opcionesCambio: d.opcionesCambio.map((v, i) => (i === indice ? valor : v)),
    }))
  }

  const quitarOpcion = (indice) => {
    setDraft((d) => ({
      ...d,
      opcionesCambio: d.opcionesCambio.filter((_, i) => i !== indice),
    }))
  }

  const guardar = async () => {
    const costoEnvio = Number(draft.costoEnvio)
    if (!Number.isFinite(costoEnvio) || costoEnvio < 0) {
      onError('El costo de envío debe ser un número mayor o igual a 0')
      return
    }
    const opcionesNumericas = draft.opcionesCambio
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
    const opcionesCambio = [...new Set(opcionesNumericas)].sort((a, b) => a - b)
    if (opcionesCambio.length === 0) {
      onError('Agrega al menos un monto válido en las opciones de cambio')
      return
    }
    setEnviando(true)
    try {
      await guardarConfiguracion({ costoEnvio, opcionesCambio, repartidorUnico: draft.repartidorUnico })
      onNotificacion('Configuración guardada')
    } catch (err) {
      onError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-card p-5 shadow-card">
        <EtiquetaSeccion>Costo de envío</EtiquetaSeccion>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Monto que se suma a los pedidos a domicilio.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.5"
            value={draft.costoEnvio}
            onChange={(e) => setDraft((d) => ({ ...d, costoEnvio: e.target.value }))}
            aria-label="Costo de envío"
            className={CLASE_INPUT}
          />
          <span className="shrink-0 text-sm font-semibold text-muted">pesos</span>
        </div>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-card">
        <EtiquetaSeccion>Opciones de cambio</EtiquetaSeccion>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Montos con los que el cliente puede pagar en domicilio. Se guardan ordenados y sin
          duplicados.
        </p>
        <div className="mt-3 space-y-2">
          {draft.opcionesCambio.map((opcion, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="1"
                value={opcion}
                onChange={(e) => cambiarOpcion(indice, e.target.value)}
                aria-label={`Monto de opción de cambio ${indice + 1}`}
                className={CLASE_INPUT}
              />
              <button
                type="button"
                onClick={() => quitarOpcion(indice)}
                aria-label={`Quitar opción ${indice + 1}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger/10 text-danger transition active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="md"
          className="mt-3 w-full"
          onClick={() => setDraft((d) => ({ ...d, opcionesCambio: [...d.opcionesCambio, ''] }))}
        >
          Agregar monto
        </Button>
      </section>

      <section className="rounded-3xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <EtiquetaSeccion>Repartidor único</EtiquetaSeccion>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Asigna automáticamente el repartidor disponible al enviar pedidos a domicilio.
            </p>
          </div>
          <Interruptor
            activo={draft.repartidorUnico}
            onChange={(v) => setDraft((d) => ({ ...d, repartidorUnico: v }))}
            ariaLabel="Repartidor único"
          />
        </div>
      </section>

      <Button className="w-full" onClick={guardar} disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar configuración'}
      </Button>
    </div>
  )
}