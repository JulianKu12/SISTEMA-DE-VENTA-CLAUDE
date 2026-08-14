import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { listarDevoluciones, listarNoCobrar, listarVentas } from '../services/reportes'

const CLASE_INPUT_DATOS =
  'w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

const CLASE_SELECT =
  'w-full rounded-full border-0 bg-input px-4 py-2 text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

const ETIQUETAS_METODO_PAGO = {
  Efectivo: 'Efectivo',
  Tarjeta: 'Tarjeta',
  Transferencia: 'Transferencia',
}

const ETIQUETAS_MEDIO_DEVOLUCION = {
  ...ETIQUETAS_METODO_PAGO,
  Efectivo_de_caja: 'Efectivo de caja',
}

const ETIQUETAS_MOTIVO_DEVOLUCION = {
  Producto_mal_estado: 'Producto en mal estado',
  Pedido_incorrecto: 'Pedido incorrecto',
  Cliente_insatisfecho: 'Cliente insatisfecho',
  Otro: 'Otro',
}

function formatearMonto(monto) {
  return (monto ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function formatearFecha(iso) {
  const d = new Date(iso)
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatearHora(iso) {
  const d = new Date(iso)
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function IconoFlechaIzquierda() {
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
      <path d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function EtiquetaSeccion({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
}

function selectorPestanasClases(activo) {
  return `rounded-full px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
    activo ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
  }`
}

function EstadoCarga({ cargando, error }) {
  if (cargando) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
        <p className="text-sm">Cargando…</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
        {error}
      </div>
    )
  }
  return null
}

function InsigniaMetodo({ metodo, noCobrar }) {
  if (noCobrar) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600">
        No cobrar
      </span>
    )
  }
  const esEfectivo = metodo === 'Efectivo'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        esEfectivo ? 'bg-green-500/10 text-green-700' : 'bg-blue-500/10 text-blue-700'
      }`}
    >
      {ETIQUETAS_METODO_PAGO[metodo] || metodo}
    </span>
  )
}

function ResumenProductos({ productos }) {
  const resumen = useMemo(() => {
    const porCombo = new Map()
    const porNombre = new Map()
    for (const p of productos || []) {
      if (p.comboId != null) {
        if (!porCombo.has(p.comboId)) {
          porCombo.set(p.comboId, {
            cantidad: p.cantidad || 1,
            nombre: p.combo ? `Combo: ${p.combo.nombre}` : 'Combo',
            precio: p.comboPrecioCongelado,
          })
        }
      } else {
        const nombre =
          typeof p.producto === 'string' ? p.producto : p.producto?.nombre || 'Producto'
        porNombre.set(nombre, (porNombre.get(nombre) || 0) + (p.cantidad || 1))
      }
    }
    const combos = [...porCombo.values()].map((c) => ({
      ...c,
      precio: c.precio != null ? formatearMonto(c.precio) : null,
    }))
    const normales = [...porNombre.entries()].map(([nombre, cantidad]) => ({
      nombre,
      cantidad,
      precio: null,
    }))
    return [...combos, ...normales]
  }, [productos])

  if (resumen.length === 0) return <span className="text-xs text-muted">Sin productos</span>
  return (
    <span className="truncate text-xs text-muted">
      {resumen
        .map((r) => `${r.cantidad}× ${r.nombre}${r.precio ? ` (${r.precio})` : ''}`)
        .join(', ')}
    </span>
  )
}

function FilaVenta({ venta }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-ink">
              {venta.pedidoId ? `Pedido #${venta.pedidoId}` : 'Venta directa'}
            </p>
            <InsigniaMetodo metodo={venta.metodoPago} noCobrar={venta.noCobrar} />
            {venta.esVentaPreviaApertura && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted/10 px-2.5 py-1 text-xs font-semibold text-muted">
                Previa a apertura
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">{formatearFecha(venta.fechaHora)}</p>
          <div className="mt-1">
            <ResumenProductos productos={venta.productos} />
          </div>
          {venta.usuario && (
            <p className="mt-1 text-xs text-muted">
              Registró:{' '}
              <span className="font-semibold text-ink">
                {venta.usuario.nombre || venta.usuario.usuario}
              </span>
            </p>
          )}
        </div>
        <p className="shrink-0 text-base font-bold text-ink">{formatearMonto(venta.total)}</p>
      </div>
    </li>
  )
}

function FilaDevolucion({ devolucion }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Devolución #{devolucion.id}</p>
          <p className="mt-0.5 text-xs text-muted">{formatearFecha(devolucion.fechaHora)}</p>
          <div className="mt-1">
            <ResumenProductos productos={devolucion.productos} />
          </div>
          <p className="mt-1 text-xs text-muted">
            Pagó con{' '}
            <span className="font-semibold text-ink">
              {ETIQUETAS_METODO_PAGO[devolucion.medioPagoOriginal] || devolucion.medioPagoOriginal}
            </span>{' '}
            · devolución en{' '}
            <span className="font-semibold text-ink">
              {ETIQUETAS_MEDIO_DEVOLUCION[devolucion.medioDevolucion] || devolucion.medioDevolucion}
            </span>{' '}
            ·{' '}
            <span className="font-semibold text-ink">
              {ETIQUETAS_MOTIVO_DEVOLUCION[devolucion.motivo] || devolucion.motivo}
            </span>
            {devolucion.regresaAInventario && ' · regresó a inventario'}
          </p>
        </div>
        <p className="shrink-0 text-base font-bold text-ink">{formatearMonto(devolucion.monto)}</p>
      </div>
    </li>
  )
}

function FilaNoCobrar({ registro }) {
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Venta sin cobrar #{registro.id}</p>
          <p className="mt-0.5 text-xs text-muted">{formatearHora(registro.fechaHora)}</p>
          <div className="mt-1 space-y-0.5">
            {(registro.productos || []).map((p, i) => (
              <p key={i} className="text-xs text-muted">
                <span className="font-semibold text-ink">{p.producto}</span> · costo{' '}
                <span className="font-semibold text-ink">{formatearMonto(p.costo)}</span>
                {p.cantidad > 1 && <span className="text-muted/70"> · {p.cantidad} pieza(s)</span>}
              </p>
            ))}
          </div>
        </div>
        <p className="shrink-0 text-base font-bold text-ink">{formatearMonto(registro.total)}</p>
      </div>
      {registro.usuario && (
        <p className="mt-2 rounded-2xl bg-surface px-4 py-2.5 text-xs text-muted">
          Marcado por{' '}
          <span className="font-semibold text-ink">
            {registro.usuario.nombre || registro.usuario.usuario} (@{registro.usuario.usuario})
          </span>
        </p>
      )}
    </li>
  )
}

function PanelVentas({ consulta, setConsulta, aplicarFiltros, versionFiltros }) {
  const [estado, setEstado] = useState({ ventas: null, error: '' })

  useEffect(() => {
    const params = {}
    if (consulta.fechaDesde) params.fechaDesde = consulta.fechaDesde
    if (consulta.fechaHasta) params.fechaHasta = consulta.fechaHasta
    if (consulta.metodoPago) params.metodoPago = consulta.metodoPago
    let activo = true
    setEstado({ ventas: null, error: '' })
    listarVentas(params)
      .then((datos) => {
        if (activo) setEstado({ ventas: datos, error: '' })
      })
      .catch((err) => {
        if (activo) setEstado({ ventas: [], error: err.message })
      })
    return () => {
      activo = false
    }
  }, [versionFiltros, consulta.fechaDesde, consulta.fechaHasta, consulta.metodoPago])

  const cargando = estado.ventas === null && !estado.error
  const hayVentas = estado.ventas && estado.ventas.length > 0

  return (
    <div className="space-y-4">
      <form
        className="rounded-3xl bg-card p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault()
          aplicarFiltros()
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted" htmlFor="rep-desde">
              Desde
            </label>
            <input
              id="rep-desde"
              type="date"
              className={CLASE_INPUT_DATOS}
              value={consulta.fechaDesde}
              onChange={(e) => setConsulta({ ...consulta, fechaDesde: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted" htmlFor="rep-hasta">
              Hasta
            </label>
            <input
              id="rep-hasta"
              type="date"
              className={CLASE_INPUT_DATOS}
              value={consulta.fechaHasta}
              onChange={(e) => setConsulta({ ...consulta, fechaHasta: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-muted" htmlFor="rep-metodo">
              Método de pago
            </label>
            <select
              id="rep-metodo"
              className={CLASE_SELECT}
              value={consulta.metodoPago}
              onChange={(e) => setConsulta({ ...consulta, metodoPago: e.target.value })}
            >
              <option value="">Todos</option>
              {Object.entries(ETIQUETAS_METODO_PAGO).map(([id, etiqueta]) => (
                <option key={id} value={id}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Button size="md" onClick={aplicarFiltros}>
            Aplicar filtros
          </Button>
        </div>
      </form>

      <EstadoCarga cargando={cargando} error={estado.error} />

      {!cargando && estado.ventas && estado.ventas.length === 0 && (
        <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
          <p className="text-sm text-muted">No hay ventas con los filtros seleccionados.</p>
        </div>
      )}

      {!cargando && hayVentas && (
        <div className="overflow-hidden rounded-3xl bg-card shadow-card">
          <ul className="divide-y divide-muted/10">
            {estado.ventas.map((venta) => (
              <FilaVenta key={venta.id} venta={venta} />
            ))}
          </ul>
          <div className="border-t border-muted/10 px-5 py-4">
            <p className="text-sm font-semibold text-ink">
              Total ventas:{' '}
              <span className="font-bold text-accent">
                {formatearMonto(
                  estado.ventas.reduce((a, v) => a + (v.noCobrar ? 0 : v.total), 0),
                )}
              </span>
              {estado.ventas.some((v) => v.noCobrar) && (
                <span className="ml-2 text-xs font-normal text-muted">
                  ({estado.ventas.filter((v) => v.noCobrar).length} de no cobrar excluidas)
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function PanelLista({ cargar, mensajeVacio, obtenerFila }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    setDatos(null)
    setError('')
    cargar()
      .then((res) => {
        if (activo) setDatos(res)
      })
      .catch((err) => {
        if (activo) setError(err.message)
      })
    return () => {
      activo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cargando = datos === null && !error

  return (
    <div className="space-y-4">
      <EstadoCarga cargando={cargando} error={error} />
      {!cargando && datos && datos.length === 0 && (
        <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
          <p className="text-sm text-muted">{mensajeVacio}</p>
        </div>
      )}
      {!cargando && datos && datos.length > 0 && (
        <div className="overflow-hidden rounded-3xl bg-card shadow-card">
          <ul className="divide-y divide-muted/10">
            {datos.map((item) => obtenerFila(item))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ReportesPage() {
  const navigate = useNavigate()
  const [pestana, setPestana] = useState('ventas')
  const [consulta, setConsulta] = useState({ fechaDesde: '', fechaHasta: '', metodoPago: '' })
  const [contadorFiltros, setContadorFiltros] = useState(0)

  const aplicarFiltros = () => setContadorFiltros((n) => n + 1)

  return (
    <main className="min-h-screen bg-surface pb-16">
      <header className="sticky top-0 z-30 border-b border-muted/10 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Volver a Pedidos"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-card transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <IconoFlechaIzquierda />
          </button>
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Reportes</h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-input p-1">
          {[
            { id: 'ventas', etiqueta: 'Ventas' },
            { id: 'devoluciones', etiqueta: 'Devoluciones' },
            { id: 'nocobrar', etiqueta: 'No cobrar' },
          ].map((opcion) => {
            const activo = pestana === opcion.id
            return (
              <button
                key={opcion.id}
                type="button"
                onClick={() => setPestana(opcion.id)}
                aria-pressed={activo}
                className={selectorPestanasClases(activo)}
              >
                {opcion.etiqueta}
              </button>
            )
          })}
        </div>

        {pestana === 'ventas' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <EtiquetaSeccion>Ventas</EtiquetaSeccion>
              <Button variant="secondary" size="md" onClick={aplicarFiltros}>
                Refrescar
              </Button>
            </div>
            <PanelVentas
              consulta={consulta}
              setConsulta={setConsulta}
              aplicarFiltros={aplicarFiltros}
              versionFiltros={contadorFiltros}
            />
          </div>
        )}

        {pestana === 'devoluciones' && (
          <div className="space-y-2">
            <EtiquetaSeccion>Devoluciones</EtiquetaSeccion>
            <PanelLista
              cargar={listarDevoluciones}
              mensajeVacio="Aún no hay devoluciones registradas."
              obtenerFila={(devolucion) => (
                <FilaDevolucion key={devolucion.id} devolucion={devolucion} />
              )}
            />
          </div>
        )}

        {pestana === 'nocobrar' && (
          <div className="space-y-2">
            <EtiquetaSeccion>No cobrar — auditoría de consumo interno</EtiquetaSeccion>
            <PanelLista
              cargar={listarNoCobrar}
              mensajeVacio="Aún no hay ventas marcadas como No cobrar."
              obtenerFila={(registro) => (
                <FilaNoCobrar key={registro.id} registro={registro} />
              )}
            />
          </div>
        )}
      </div>
    </main>
  )
}

export default ReportesPage