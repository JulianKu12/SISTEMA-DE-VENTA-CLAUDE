import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import ModalHoja from '../components/ui/ModalHoja'
import {
  abrirCaja,
  cerrarCaja,
  crearGasto,
  listarGastos,
  obtenerEstadoCaja,
  obtenerHistorialCaja,
  obtenerVentas,
} from '../services/caja'
import { obtenerProductos } from '../services/catalogo'

const CATEGORIAS_GASTO = ['Insumos', 'Servicios', 'Sueldos', 'Otro']
const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia']

const CLASE_INPUT =
  'w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

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

function EtiquetaSeccion({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
}

function selectorPestanasClases(activo) {
  return `rounded-full px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
    activo ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
  }`
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

function formatearDifDiferencia(dif) {
  if (dif > 0) return `Sobran ${formatearMonto(dif)}`
  if (dif < 0) return `Faltan ${formatearMonto(Math.abs(dif))}`
  return 'Cuadra exacto'
}

function ModalFormularioAbrir({ fondoInicial, productos, onCerrar, onGuardar }) {
  const [huboVentas, setHuboVentas] = useState(null)
  const [filas, setFilas] = useState([{ productoId: '', cantidad: '1', metodoPago: 'Efectivo' }])
  const [error, setError] = useState('')
  const [stockFaltante, setStockFaltante] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const ventasValidas = filas.filter((f) => f.productoId && f.cantidad !== '')
  const todasValidas =
    ventasValidas.length > 0 && ventasValidas.every((f) => Number.isInteger(Number(f.cantidad)) && Number(f.cantidad) >= 1)

  const confirmar = async () => {
    setError('')
    setStockFaltante(null)
    if (huboVentas && !todasValidas) {
      setError('Indica un producto válido con cantidad entera mayor o igual a 1 en al menos una venta.')
      return
    }
    const ventasPrevias = huboVentas
      ? ventasValidas.map((f) => ({
          productos: [{ productoId: Number(f.productoId), cantidad: Number(f.cantidad) }],
          metodoPago: f.metodoPago,
        }))
      : []
    setEnviando(true)
    try {
      await onGuardar(ventasPrevias)
      onCerrar()
    } catch (err) {
      setError(err.message)
      if (err.stockInsuficiente) setStockFaltante(err.stockInsuficiente)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalHoja
      abierto
      titulo="Abrir caja"
      subtitulo={`Fondo inicial: ${formatearMonto(fondoInicial)}`}
      onCerrar={onCerrar}
    >
      {error && (
        <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

      {stockFaltante?.length > 0 && (
        <div className="mt-3 space-y-1.5 rounded-2xl bg-danger/5 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-danger">Stock insuficiente</p>
          {stockFaltante.map((f) => (
            <p key={`${f.tipo}-${f.id}`} className="text-sm text-ink">
              {f.nombre}: requerido {f.requerido} · disponible {f.disponible}
            </p>
          ))}
        </div>
      )}

      {huboVentas === null && (
        <div className="space-y-2">
          <p className="text-sm leading-relaxed text-muted">
            ¿Hubo ventas antes de abrir la caja? Si es así, puedes registrarlas ahora.
          </p>
          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={() => setHuboVentas(true)}
              className="inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-base font-semibold text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] transition duration-150 ease-out active:scale-[0.97]"
            >
              Sí, hubo ventas
            </button>
            <button
              type="button"
              onClick={() => setHuboVentas(false)}
              className="inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97]"
            >
              No, abrir de inmediato
            </button>
          </div>
        </div>
      )}

      {huboVentas === false && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Se abrirá la caja con fondo {formatearMonto(fondoInicial)} sin ventas previas.
          </p>
          <Button
            size="md"
            className="w-full"
            disabled={enviando}
            onClick={confirmar}
          >
            {enviando ? 'Abriendo…' : 'Abrir caja'}
          </Button>
        </div>
      )}

      {huboVentas === true && (
        <div className="space-y-4">
          <div className="space-y-3">
            {filas.map((fila, idx) => (
              <div key={idx} className="space-y-2 rounded-2xl bg-surface p-4">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-semibold text-muted">
                      Producto vendido
                    </label>
                    <select
                      className={CLASE_INPUT}
                      value={fila.productoId}
                      onChange={(e) =>
                        setFilas((fs) =>
                          fs.map((f, i) => (i === idx ? { ...f, productoId: e.target.value } : f)),
                        )
                      }
                    >
                      <option value="">Selecciona…</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}{' '}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs font-semibold text-muted">Cantidad</label>
                    <input
                      className={CLASE_INPUT}
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={fila.cantidad}
                      onChange={(e) =>
                        setFilas((fs) =>
                          fs.map((f, i) => (i === idx ? { ...f, cantidad: e.target.value } : f)),
                        )
                      }
                    />
                  </div>
                  {filas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFilas((fs) => fs.filter((_, i) => i !== idx))}
                      aria-label="Quitar venta"
                      className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/10 text-muted transition hover:text-danger active:scale-95"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    Método de pago
                  </label>
                  <select
                    className={CLASE_INPUT}
                    value={fila.metodoPago}
                    onChange={(e) =>
                      setFilas((fs) =>
                        fs.map((f, i) => (i === idx ? { ...f, metodoPago: e.target.value } : f)),
                      )
                    }
                  >
                    {METODOS_PAGO.map((mp) => (
                      <option key={mp} value={mp}>
                        {mp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setFilas((fs) => [...fs, { productoId: '', cantidad: '1', metodoPago: 'Efectivo' }])}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition active:scale-[0.97]"
            >
              <IconoMas /> Agregar venta
            </button>
          </div>
          <Button size="md" className="w-full" disabled={enviando} onClick={confirmar}>
            {enviando ? 'Abriendo…' : 'Abrir caja y registrar ventas'}
          </Button>
        </div>
      )}
    </ModalHoja>
  )
}

function ModalFormularioCierre({ onCerrar, onGuardar }) {
  const [efectivo, setEfectivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const confirmar = async () => {
    setError('')
    if (efectivo === '' || Number.isNaN(Number(efectivo))) {
      return setError('Indica el efectivo contado (número)')
    }
    setEnviando(true)
    try {
      await onGuardar(Number(efectivo))
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <ModalHoja abierto titulo="Cerrar caja" subtitulo="Cuenta el efectivo de la caja antes de cerrar." onCerrar={onCerrar}>
      {error && (
        <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-ink" htmlFor="caja-efectivo">
          Efectivo contado
        </label>
        <input
          id="caja-efectivo"
          className={CLASE_INPUT}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={efectivo}
          onChange={(e) => setEfectivo(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </div>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCerrar}
          disabled={enviando}
          className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={enviando}
          className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-base font-semibold text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
        >
          {enviando ? 'Cerrando…' : 'Cerrar caja'}
        </button>
      </div>
    </ModalHoja>
  )
}

function ModalFormularioGasto({ onCerrar, onGuardar }) {
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [categoria, setCategoria] = useState('Insumos')
  const [metodoPago, setMetodoPago] = useState('Efectivo')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!concepto.trim()) return setError('Escribe el concepto del gasto')
    if (monto === '' || Number(monto) < 0) return setError('El monto debe ser mayor o igual a 0')

    setEnviando(true)
    try {
      await onGuardar({
        concepto: concepto.trim(),
        monto: Number(monto),
        categoria,
        metodoPago,
      })
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
      titulo="Nuevo gasto"
      subtitulo={
        'Si no hay caja abierta, el gasto queda pendiente de asociarse a la próxima apertura.'
      }
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
      {error && (
        <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </div>
      )}

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="gas-concepto">
            Concepto
          </label>
          <input
            id="gas-concepto"
            className={CLASE_INPUT}
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Refrigerio del equipo"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="gas-monto">
            Monto
          </label>
          <input
            id="gas-monto"
            className={CLASE_INPUT}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink" htmlFor="gas-categoria">
              Categoría
            </label>
            <select
              id="gas-categoria"
              className={CLASE_INPUT}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink" htmlFor="gas-metodo">
              Método de pago
            </label>
            <select
              id="gas-metodo"
              className={CLASE_INPUT}
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
            >
              {METODOS_PAGO.map((mp) => (
                <option key={mp} value={mp}>
                  {mp}
                </option>
              ))}
            </select>
          </div>
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

function FilaResumen({ etiqueta, valor, tono }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
      <span className="text-sm text-muted">{etiqueta}</span>
      <span className={`text-sm font-bold ${tono || 'text-ink'}`}>{valor}</span>
    </div>
  )
}

function CajaPage({ pestanaInicial = 'caja' }) {
  const navigate = useNavigate()
  const [pestana, setPestana] = useState(pestanaInicial)
  const [estado, setEstado] = useState(null)
  const [gastos, setGastos] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [productos, setProductos] = useState([])
  const [fondo, setFondo] = useState('')
  const [errorLista, setErrorLista] = useState('')
  const [notificacion, setNotificacion] = useState('')

  const [modalAbrir, setModalAbrir] = useState(null)
  const [modalCerrar, setModalCerrar] = useState(false)
  const [modalGasto, setModalGasto] = useState(false)
  const [resultadoCierre, setResultadoCierre] = useState(null)
  const [resumen, setResumen] = useState(null)

  const cargar = async () => {
    const [e, g, h] = await Promise.allSettled([
      obtenerEstadoCaja(),
      listarGastos(),
      obtenerHistorialCaja(),
    ])
    if (e.status === 'fulfilled') setEstado(e.value)
    else setErrorLista((prev) => prev || e.reason.message)
    if (g.status === 'fulfilled') setGastos(g.value)
    else setErrorLista((prev) => prev || g.reason.message)
    if (h.status === 'fulfilled') setHistorial(h.value)
    else setErrorLista((prev) => prev || h.reason.message)
  }

  useEffect(() => {
    let activo = true
    cargar().catch(() => {})
    obtenerProductos()
      .then((datos) => {
        if (activo) setProductos(datos)
      })
      .catch(() => {
        // productos solo se usan para el selector de ventas previas a apertura
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

  const guardarApertura = async (ventasPrevias) => {
    await abrirCaja({ fondoInicial: Number(modalAbrir.fondoInicial), ventasPrevias })
    setModalAbrir(null)
    setNotificacion('Caja abierta')
    setFondo('')
    cargar()
  }

  const guardarCierre = async (efectivoContado) => {
    const res = await cerrarCaja({ efectivoContado })
    setModalCerrar(false)
    setResultadoCierre(res)
    setNotificacion('Caja cerrada')
    cargar()
  }

  const guardarGasto = async (payload) => {
    const res = await crearGasto(payload)
    setNotificacion(
      res.asociadoASiguienteDia ? 'Gasto registrado (se asociará a la próxima caja)' : 'Gasto registrado',
    )
    cargar()
  }

  const abrirResumen = async (dia) => {
    setErrorLista('')
    try {
      const [ventas, todosGastos] = await Promise.all([obtenerVentas(dia.id), listarGastos()])
      const ventasNormales = (ventas || []).filter((v) => !v.noCobrar && !v.esVentaPreviaApertura)
      const ventasEfectivo = ventas
        .filter((v) => !v.noCobrar && !v.esVentaPreviaApertura && v.metodoPago === 'Efectivo')
        .reduce((a, v) => a + v.total, 0)
      const ventasTarjeta = ventas
        .filter((v) => !v.noCobrar && !v.esVentaPreviaApertura && v.metodoPago === 'Tarjeta')
        .reduce((a, v) => a + v.total, 0)
      const ventasTransferencia = ventas
        .filter((v) => !v.noCobrar && !v.esVentaPreviaApertura && v.metodoPago === 'Transferencia')
        .reduce((a, v) => a + v.total, 0)
      const gastosDia = (todosGastos || []).filter((g) => g.diaOperativoId === dia.id)
      const gastosEfectivo = gastosDia
        .filter((g) => g.metodoPago === 'Efectivo')
        .reduce((a, g) => a + g.monto, 0)
      setResumen({
        totalVentas: ventasNormales.length,
        ventasEfectivo,
        ventasTarjeta,
        ventasTransferencia,
        gastosEfectivo,
        esperado: dia.fondoInicial + ventasEfectivo - gastosEfectivo,
      })
    } catch (err) {
      setErrorLista(err.message)
    }
  }

  const cargandoInicial = estado === null && !errorLista

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
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Caja</h1>
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

        <div className="grid grid-cols-2 gap-1 rounded-full bg-input p-1">
          {[
            { id: 'caja', etiqueta: 'Caja' },
            { id: 'gastos', etiqueta: 'Gastos' },
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

        {cargandoInicial && (
          <div className="flex flex-col items-center gap-3 py-24 text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
            <p className="text-sm">Cargando…</p>
          </div>
        )}

        {!cargandoInicial && pestana === 'caja' && estado !== null && (
          <>
            {estado.abierta && estado.dia ? (
              <div className="rounded-3xl bg-card p-5 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-base font-bold text-ink">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                      Caja abierta
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Apertura:{' '}
                      <span className="font-semibold text-ink">
                        {formatearFecha(estado.dia.fechaApertura)}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      Fondo inicial:{' '}
                      <span className="font-semibold text-ink">
                        {formatearMonto(estado.dia.fondoInicial)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="md" onClick={() => abrirResumen(estado.dia)}>
                      Ver resumen
                    </Button>
                    <Button size="md" onClick={() => setModalCerrar(true)}>
                      Cerrar caja
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-card p-5 shadow-card">
                <p className="text-base font-bold text-ink">No hay caja abierta</p>
                <p className="mt-1 text-sm text-muted">
                  Abre una caja para registrar ventas y gastos del día.
                </p>
                <form
                  className="mt-4 flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    setErrorLista('')
                    if (fondo === '' || Number(fondo) < 0) {
                      setErrorLista('El fondo inicial debe ser mayor o igual a 0')
                      return
                    }
                    setModalAbrir({ fondoInicial: Number(fondo) })
                  }}
                >
                  <div className="min-w-0 flex-1 sm:max-w-xs">
                    <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="caja-fondo">
                      Fondo inicial
                    </label>
                    <input
                      id="caja-fondo"
                      className={CLASE_INPUT}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={fondo}
                      onChange={(e) => setFondo(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <Button size="md" type="submit">
                    Abrir caja
                  </Button>
                </form>
              </div>
            )}

            <section>
              <EtiquetaSeccion>Historial de cortes</EtiquetaSeccion>
              {historial === null ? (
                <div className="rounded-3xl bg-card px-6 py-10 text-center text-sm text-muted shadow-card">
                  Cargando historial…
                </div>
              ) : historial.length === 0 ? (
                <div className="rounded-3xl bg-card px-6 py-10 text-center shadow-card">
                  <p className="text-sm text-muted">Aún no hay cortes de caja.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                  <ul className="divide-y divide-muted/10">
                    {historial.map((corte) => {
                      const dif = corte.diferencia ?? 0
                      const tono = dif < 0 ? 'text-danger' : 'text-green-700'
                      return (
                        <li key={corte.id} className="px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-ink">
                                Apertura {formatearFecha(corte.fechaApertura)}
                              </p>
                              <p className="mt-0.5 text-xs text-muted">
                                Fondo:{' '}
                                <span className="font-semibold text-ink">
                                  {formatearMonto(corte.fondoInicial)}
                                </span>{' '}
                                · Contado:{' '}
                                <span className="font-semibold text-ink">
                                  {formatearMonto(corte.efectivoContado)}
                                </span>
                              </p>
                            </div>
                            <span className={`text-sm font-bold ${tono}`}>
                              {formatearDifDiferencia(dif)}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}

        {!cargandoInicial && pestana === 'gastos' && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <EtiquetaSeccion>
                {gastos?.length ?? 0} gasto{gastos?.length === 1 ? '' : 's'}
              </EtiquetaSeccion>
              <Button size="md" onClick={() => setModalGasto(true)}>
                <IconoMas /> Nuevo gasto
              </Button>
            </div>

            {gastos === null ? (
              <div className="rounded-3xl bg-card px-6 py-10 text-center text-sm text-muted shadow-card">
                Cargando gastos…
              </div>
            ) : gastos.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">Aún no hay gastos registrados.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <ul className="divide-y divide-muted/10">
                  {gastos.map((gasto) => (
                    <li key={gasto.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">{gasto.concepto}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {gasto.categoria} · {gasto.metodoPago} ·{' '}
                            {formatearFecha(gasto.fechaHora)}
                            {!gasto.diaOperativoId && (
                              <span className="text-amber-600">
                                {' '}
                                · pendiente de asociar a la próxima caja
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-ink">
                          {formatearMonto(gasto.monto)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      {modalAbrir && (
        <ModalFormularioAbrir
          fondoInicial={modalAbrir.fondoInicial}
          productos={productos}
          onCerrar={() => setModalAbrir(null)}
          onGuardar={guardarApertura}
        />
      )}

      {modalCerrar && (
        <ModalFormularioCierre
          onCerrar={() => setModalCerrar(false)}
          onGuardar={guardarCierre}
        />
      )}

      {modalGasto && (
        <ModalFormularioGasto
          onCerrar={() => setModalGasto(false)}
          onGuardar={guardarGasto}
        />
      )}

      {resumen && (
        <ModalHoja abierto titulo="Resumen del día" onCerrar={() => setResumen(null)}>
          <div className="space-y-2">
            <FilaResumen etiqueta="Ventas del día" valor={String(resumen.totalVentas)} />
            <FilaResumen etiqueta="Efectivo" valor={formatearMonto(resumen.ventasEfectivo)} tono="text-accent" />
            <FilaResumen etiqueta="Tarjeta" valor={formatearMonto(resumen.ventasTarjeta)} />
            <FilaResumen etiqueta="Transferencia" valor={formatearMonto(resumen.ventasTransferencia)} />
            <FilaResumen etiqueta="Gastos en efectivo" valor={formatearMonto(resumen.gastosEfectivo)} />
            <FilaResumen
              etiqueta="Efectivo esperado"
              valor={formatearMonto(resumen.esperado)}
              tono="text-accent"
            />
          </div>
          <Button size="md" className="mt-5 w-full" onClick={() => setResumen(null)}>
            Entendido
          </Button>
        </ModalHoja>
      )}

      {resultadoCierre && (
        <ModalHoja
          abierto
          titulo="Caja cerrada"
          subtitulo={formatearFecha(resultadoCierre.diaOperativo?.fechaCierre)}
          onCerrar={() => setResultadoCierre(null)}
        >
          <div className="space-y-2">
            <FilaResumen etiqueta="Efectivo esperado" valor={formatearMonto(resultadoCierre.cierre?.efectivoEsperado)} />
            <FilaResumen etiqueta="Efectivo contado" valor={formatearMonto(resultadoCierre.cierre?.efectivoContado)} />
            <FilaResumen
              etiqueta="Diferencia"
              valor={formatearDifDiferencia(resultadoCierre.cierre?.diferencia ?? 0)}
              tono={(resultadoCierre.cierre?.diferencia ?? 0) < 0 ? 'text-danger' : 'text-green-700'}
            />
          </div>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">
            Métodos de pago (informativo)
          </p>
          <div className="mt-2 space-y-2">
            <FilaResumen etiqueta="Ventas en efectivo" valor={formatearMonto(resultadoCierre.ventas?.efectivo)} />
            <FilaResumen etiqueta="Ventas con tarjeta" valor={formatearMonto(resultadoCierre.ventas?.tarjeta)} />
            <FilaResumen etiqueta="Ventas por transferencia" valor={formatearMonto(resultadoCierre.ventas?.transferencia)} />
            <FilaResumen etiqueta="Gastos en efectivo" valor={formatearMonto(resultadoCierre.gastosEfectivo)} />
          </div>
          {(resultadoCierre.pedidosPendientesPago?.cantidad || 0) > 0 && (
            <div className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600">
              {resultadoCierre.pedidosPendientesPago.cantidad} pedido
              {resultadoCierre.pedidosPendientesPago.cantidad === 1 ? '' : 's'} quedó
              {(resultadoCierre.pedidosPendientesPago.cantidad === 1 ? '' : 'quedaron')} con pago
              pendiente
              {resultadoCierre.pedidosEntregadosPendientesPago?.cantidad > 0 && (
                <>
                  {' '}
                  (entre ellos {resultadoCierre.pedidosEntregadosPendientesPago.cantidad} entregado
                  {resultadoCierre.pedidosEntregadosPendientesPago.cantidad === 1 ? '' : 's'} por{' '}
                  {formatearMonto(resultadoCierre.pedidosEntregadosPendientesPago.monto)})
                </>
              )}
              .
            </div>
          )}
          <Button size="md" className="mt-5 w-full" onClick={() => setResultadoCierre(null)}>
            Entendido
          </Button>
        </ModalHoja>
      )}
    </main>
  )
}

export default CajaPage