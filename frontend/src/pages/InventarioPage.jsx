import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import ModalHoja from '../components/ui/ModalHoja'
import { obtenerStock, registrarAjuste, registrarEntrada } from '../services/inventario'

const CLASE_INPUT =
  'w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

const MOTIVOS_AJUSTE = [
  { id: 'Conteo_fisico', etiqueta: 'Conteo físico' },
  { id: 'Merma', etiqueta: 'Merma' },
  { id: 'Otro', etiqueta: 'Otro' },
]

function formatearStock(cantidad) {
  return cantidad.toLocaleString('es-MX', { maximumFractionDigits: 2 })
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

function IconoMas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconoAjuste() {
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
      <path d="M4 4v7m0 9v-5M12 4v3m0 9v4M20 4v11m0 5v-3" strokeLinecap="round" />
    </svg>
  )
}

function EtiquetaSeccion({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
}

function estadoStock(cuenta) {
  if (cuenta.stockActual < 0) return { color: 'text-danger', etiqueta: 'Negativo' }
  if (cuenta.stockMinimoAlerta != null && cuenta.stockActual < cuenta.stockMinimoAlerta) {
    return { color: 'text-amber-600', etiqueta: 'Bajo' }
  }
  return { color: 'text-ink', etiqueta: null }
}

function SelectorCuenta({ cuentas, valor, onChange }) {
  return (
    <select className={CLASE_INPUT} value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecciona…</option>
      {cuentas.map((c) => (
        <option key={`${c.tipo}-${c.id}`} value={`${c.tipo}:${c.id}`}>
          {c.nombre} {c.tipo === 'ingrediente' ? `(${c.unidadMedida})` : '(reventa)'}
        </option>
      ))}
    </select>
  )
}

function ModalFormularioEntrada({ cuentas, onCerrar, onGuardar }) {
  const [seleccion, setSeleccion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cuenta = useMemo(() => {
    if (!seleccion) return null
    const [tipo, id] = seleccion.split(':')
    return cuentas.find((c) => c.tipo === tipo && c.id === Number(id)) || null
  }, [seleccion, cuentas])

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!cuenta) return setError('Selecciona un ingrediente o producto')
    if (cantidad === '' || Number(cantidad) <= 0) {
      return setError('La cantidad debe ser mayor a 0')
    }
    const payload = { cantidad: Number(cantidad) }
    if (cuenta.tipo === 'ingrediente') payload.ingredienteId = cuenta.id
    else payload.productoId = cuenta.id
    if (costo !== '' && Number(costo) < 0) return setError('El costo debe ser mayor o igual a 0')
    if (costo !== '') payload.costo = Number(costo)

    setEnviando(true)
    try {
      await onGuardar(payload)
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalHoja
      abierto
      titulo="Registrar entrada"
      subtitulo="Agrega existencias a un ingrediente o producto de reventa."
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        {error && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="ent-cuenta">
            Ingrediente o producto
          </label>
          <SelectorCuenta cuentas={cuentas} valor={seleccion} onChange={setSeleccion} />
        </div>
        {cuenta && (
          <p className="text-sm text-muted">
            Stock actual:{' '}
            <span className="font-semibold text-ink">
              {formatearStock(cuenta.stockActual)} {cuenta.unidadMedida || ''}
            </span>
          </p>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="ent-cantidad">
            Cantidad
          </label>
          <input
            id="ent-cantidad"
            className={CLASE_INPUT}
            type="number"
            min="0.01"
            step="any"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="ent-costo">
            Costo de la entrada{' '}
            <span className="font-normal text-muted">(opcional, genera un gasto)</span>
          </label>
          <input
            id="ent-costo"
            className={CLASE_INPUT}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-base font-semibold text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalHoja>
  )
}

function ModalFormularioAjuste({ cuentas, onCerrar, onGuardar }) {
  const [seleccion, setSeleccion] = useState('')
  const [stockContado, setStockContado] = useState('')
  const [motivo, setMotivo] = useState('Conteo_fisico')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cuenta = useMemo(() => {
    if (!seleccion) return null
    const [tipo, id] = seleccion.split(':')
    return cuentas.find((c) => c.tipo === tipo && c.id === Number(id)) || null
  }, [seleccion, cuentas])

  const diferencia = useMemo(() => {
    if (!cuenta || stockContado === '') return null
    return Number(stockContado) - cuenta.stockActual
  }, [cuenta, stockContado])

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!cuenta) return setError('Selecciona un ingrediente o producto')
    if (stockContado === '' || Number.isNaN(Number(stockContado))) {
      return setError('Indica el stock real contado')
    }
    const payload = { stockRealContado: Number(stockContado), motivo }
    if (cuenta.tipo === 'ingrediente') payload.ingredienteId = cuenta.id
    else payload.productoId = cuenta.id

    setEnviando(true)
    try {
      await onGuardar(payload, diferencia)
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalHoja
      abierto
      titulo="Ajuste manual"
      subtitulo="Corrige el stock contado físicamente para que coincida con el sistema."
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        {error && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="aju-cuenta">
            Ingrediente o producto
          </label>
          <SelectorCuenta cuentas={cuentas} valor={seleccion} onChange={setSeleccion} />
        </div>
        {cuenta && (
          <p className="text-sm text-muted">
            Stock actual en sistema:{' '}
            <span className="font-semibold text-ink">
              {formatearStock(cuenta.stockActual)} {cuenta.unidadMedida || ''}
            </span>
          </p>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="aju-stock">
            Stock real contado
          </label>
          <input
            id="aju-stock"
            className={CLASE_INPUT}
            type="number"
            step="any"
            inputMode="decimal"
            value={stockContado}
            onChange={(e) => setStockContado(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </div>
        {diferencia !== null && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              diferencia === 0
                ? 'bg-green-500/10 text-green-700'
                : diferencia > 0
                  ? 'bg-green-500/10 text-green-700'
                  : 'bg-amber-500/15 text-amber-600'
            }`}
          >
            {diferencia === 0
              ? 'Sin diferencia: coincide con el stock actual'
              : `Diferencia: ${formatearStock(diferencia)} ${
                  diferencia > 0 ? 'más' : 'menos'
                } de lo registrado`}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="aju-motivo">
            Motivo
          </label>
          <select
            id="aju-motivo"
            className={CLASE_INPUT}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          >
            {MOTIVOS_AJUSTE.map((m) => (
              <option key={m.id} value={m.id}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={enviando}
            className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-base font-semibold text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </ModalHoja>
  )
}

function FilaStock({ cuenta }) {
  const stock = estadoStock(cuenta)
  const unidad = cuenta.unidadMedida ? ` ${cuenta.unidadMedida}` : ''
  return (
    <li className="flex items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink">{cuenta.nombre}</p>
        <p className="mt-0.5 text-xs text-muted">
          {cuenta.tipo === 'ingrediente' ? 'Ingrediente' : 'Reventa directa'}
          {cuenta.stockMinimoAlerta != null && (
            <span className="text-muted/70"> · mín. {formatearStock(cuenta.stockMinimoAlerta)}{unidad}</span>
          )}
        </p>
      </div>
      <span className={`shrink-0 text-sm font-bold ${stock.color}`}>
        {formatearStock(cuenta.stockActual)}
        {unidad}
        {stock.etiqueta && (
          <span className="ml-1.5 text-xs font-semibold">· {stock.etiqueta}</span>
        )}
      </span>
    </li>
  )
}

function InventarioPage() {
  const navigate = useNavigate()
  const [stock, setStock] = useState(null)
  const [errorLista, setErrorLista] = useState('')
  const [notificacion, setNotificacion] = useState('')
  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalAjuste, setModalAjuste] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('activos')

  const cargar = async () => {
    setErrorLista('')
    try {
      const datos = await obtenerStock()
      setStock(datos)
    } catch (err) {
      setErrorLista(err.message)
    }
  }

  useEffect(() => {
    let activo = true
    obtenerStock()
      .then((datos) => {
        if (activo) setStock(datos)
      })
      .catch((err) => {
        if (activo) setErrorLista(err.message)
      })
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    if (!notificacion) return
    const t = setTimeout(() => setNotificacion(''), 3500)
    return () => clearTimeout(t)
  }, [notificacion])

  const cuentas = useMemo(() => {
    if (!stock) return []
    const ingredientes = (stock.ingredientes || []).map((i) => ({
      ...i,
      tipo: 'ingrediente',
    }))
    const productos = (stock.productos || []).map((p) => ({ ...p, tipo: 'producto' }))
    return [...ingredientes, ...productos].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [stock])

  const cuentasActivas = useMemo(() => cuentas.filter((c) => c.estado === 'Activo'), [cuentas])

  const cuentasVisibles = useMemo(() => {
    return cuentas.filter((c) => {
      if (filtroEstado === 'activos') return c.estado === 'Activo'
      if (filtroEstado === 'inactivos') return c.estado !== 'Activo'
      return true
    })
  }, [cuentas, filtroEstado])

  const guardarEntrada = async (payload) => {
    const res = await registrarEntrada(payload)
    setNotificacion(
      res.gasto ? 'Entrada registrada (se generó el gasto de Insumos)' : 'Entrada registrada',
    )
    cargar()
  }

  const guardarAjuste = async (payload, diferencia) => {
    const res = await registrarAjuste(payload)
    setNotificacion(
      res.mensaje || (diferencia !== null && diferencia !== 0 ? 'Ajuste registrado' : 'Sin cambios'),
    )
    cargar()
  }

  const cargando = stock === null && !errorLista

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
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Inventario</h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        {errorLista && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {errorLista}
          </div>
        )}
        {notificacion && (
          <div className="rounded-2xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700">
            {notificacion}
          </div>
        )}

        {errorLista && stock === null && (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center shadow-card">
            <p className="text-sm text-muted">No se pudo cargar el inventario.</p>
            <Button variant="secondary" size="md" onClick={cargar}>
              Reintentar
            </Button>
          </div>
        )}

        {cargando && (
          <div className="flex flex-col items-center gap-3 py-24 text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
            <p className="text-sm">Cargando…</p>
          </div>
        )}

        {!cargando && stock !== null && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <EtiquetaSeccion>Stock actual</EtiquetaSeccion>
              <div className="flex flex-wrap gap-2">
                <Button size="md" onClick={() => setModalAjuste(true)}>
                  <IconoAjuste /> Ajuste manual
                </Button>
                <Button size="md" variant="secondary" onClick={() => setModalEntrada(true)}>
                  <IconoMas /> Registrar entrada
                </Button>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-1 rounded-full bg-input p-1">
              {[
                { id: 'activos', etiqueta: 'Activos' },
                { id: 'inactivos', etiqueta: 'Inactivos' },
                { id: 'todos', etiqueta: 'Todos' },
              ].map((opcion) => {
                const activo = filtroEstado === opcion.id
                return (
                  <button
                    key={opcion.id}
                    type="button"
                    onClick={() => setFiltroEstado(opcion.id)}
                    aria-pressed={activo}
                    className={`rounded-full px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                      activo ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {opcion.etiqueta}
                  </button>
                )
              })}
            </div>

            {cuentas.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">
                  Aún no hay ingredientes ni productos de reventa.
                </p>
              </div>
            ) : cuentasVisibles.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">
                  No hay resultados con el filtro seleccionado.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <ul className="divide-y divide-muted/10">
                  {cuentasVisibles.map((cuenta) => (
                    <FilaStock key={`${cuenta.tipo}-${cuenta.id}`} cuenta={cuenta} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {modalEntrada && (
        <ModalFormularioEntrada
          cuentas={cuentasActivas}
          onCerrar={() => setModalEntrada(false)}
          onGuardar={guardarEntrada}
        />
      )}

      {modalAjuste && (
        <ModalFormularioAjuste
          cuentas={cuentasActivas}
          onCerrar={() => setModalAjuste(false)}
          onGuardar={guardarAjuste}
        />
      )}
    </main>
  )
}

export default InventarioPage