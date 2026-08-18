import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import ConfirmModal from '../components/ui/ConfirmModal'
import BannerToaster from '../components/ui/BannerToaster'
import { obtenerCombos, obtenerProductos } from '../services/catalogo'
import { useConfiguracion } from '../context/useConfiguracion'
import { ModalCombo, ModalProducto } from './NuevoPedidoPage'
import {
  obtenerPedido,
  cambiarEstadoPago,
  cambiarEstadoPreparacion,
  editarPedido,
  obtenerRepartidoresDisponibles,
} from '../services/pedidos'
import { obtenerVenta, registrarDevolucion } from '../services/devoluciones'
import { esMismaConfiguracion } from '../utils/ticket'

const CONFIG_ESTADOS = {
  Pendiente: {
    etiqueta: 'Pendiente',
    punto: 'bg-amber-500',
    fondo: 'bg-amber-500/10',
    texto: 'text-amber-700',
  },
  En_preparacion: {
    etiqueta: 'En preparación',
    punto: 'bg-blue-500',
    fondo: 'bg-blue-500/10',
    texto: 'text-blue-700',
  },
  Enviado: {
    etiqueta: 'Enviado',
    punto: 'bg-purple-500',
    fondo: 'bg-purple-500/10',
    texto: 'text-purple-700',
  },
  Entregado: {
    etiqueta: 'Entregado',
    punto: 'bg-green-500',
    fondo: 'bg-green-500/10',
    texto: 'text-green-700',
  },
  Cancelado: {
    etiqueta: 'Cancelado',
    punto: 'bg-gray-400',
    fondo: 'bg-muted/10',
    texto: 'text-muted',
  },
}

const CONFIG_PAGO = {
  Pagado: { etiqueta: 'Pagado', fondo: 'bg-green-500/10', texto: 'text-green-700' },
  Pendiente_pago: {
    etiqueta: 'Pendiente de pago',
    fondo: 'bg-amber-500/10',
    texto: 'text-amber-700',
  },
}

const ETIQUETA_TIPO = {
  Para_recoger: 'Para recoger',
  A_domicilio: 'A domicilio',
}

const ETIQUETA_ORIGEN = {
  Mostrador: 'Mostrador',
  Telefono: 'Por teléfono',
}

const MOTIVOS_DEVOLUCION = [
  { id: 'Producto_mal_estado', etiqueta: 'Producto en mal estado' },
  { id: 'Pedido_incorrecto', etiqueta: 'Pedido incorrecto' },
  { id: 'Cliente_insatisfecho', etiqueta: 'Cliente insatisfecho' },
  { id: 'Otro', etiqueta: 'Otro' },
]

const MEDIOS_DEVOLUCION = [
  { id: 'Efectivo', etiqueta: 'Efectivo (fuera de esta caja / ya cerrada)' },
  { id: 'Tarjeta', etiqueta: 'Tarjeta' },
  { id: 'Transferencia', etiqueta: 'Transferencia' },
  { id: 'Efectivo_de_caja', etiqueta: 'Efectivo (se resta de esta caja)' },
]

function formatearMonto(monto) {
  if (monto == null) return '—'
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function formatHora(iso) {
  const fecha = new Date(iso)
  const hora = fecha.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const dia = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  return `${hora} · ${dia}`
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

function IconoBasura() {
  return (
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
      <path d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-0.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0c.035-.167.08-.332.136-.497C7.51 4.03 8.392 3 9.5 3h5c1.108 0 1.99 1.03 2.17 2.528v.062c.056.165.101.33.136.497M3.75 6.747c.34-.059.68-.114 1.022-.165" />
    </svg>
  )
}

function EtiquetaSeccion({ children }) {
  return <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
}

function FilaInfo({ etiqueta, valor }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-muted">{etiqueta}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-ink">{valor}</span>
    </div>
  )
}

function construirLineas(pedido) {
  const grupos = new Map()
  const normales = []
  for (const pp of pedido.productos || []) {
    if (pp.comboId) {
      if (!grupos.has(pp.comboId)) {
        grupos.set(pp.comboId, {
          tipo: 'combo',
          tipoLinea: 'combo',
          comboId: pp.comboId,
          nombre: pp.combo?.nombre || 'Combo',
          comboPrecioCongelado: pp.comboPrecioCongelado,
          nota: pp.notaCombo ?? '',
          filas: [],
          pedidoProductoIds: [],
          productos: [],
        })
      }
      grupos.get(pp.comboId).filas.push(pp)
      grupos.get(pp.comboId).pedidoProductoIds.push(pp.id)
      grupos.get(pp.comboId).productos.push({
        productoId: pp.productoId,
        nota: pp.nota ?? '',
        modificadores: pp.modificadores || [],
      })
    } else {
      const conMods = (pp.modificadores || []).reduce((acc, m) => acc + m.costoAplicado, 0)
      normales.push({
        tipo: 'producto',
        tipoLinea: 'producto',
        pedidoProductoId: pp.id,
        productoId: pp.productoId,
        nombre: pp.producto?.nombre || 'Producto',
        cantidad: pp.cantidad,
        precioUnitario: pp.precioCongelado + conMods,
        esMitad: pp.esMitadYMitad,
        esMitadYMitad: pp.esMitadYMitad,
        sabor1: pp.mitadYMitad ? { id: pp.mitadYMitad.sabor1ProductoId } : null,
        sabor2: pp.mitadYMitad ? { id: pp.mitadYMitad.sabor2ProductoId } : null,
        mitad: pp.mitadYMitad,
        modificadores: pp.modificadores || [],
        nota: pp.nota ?? '',
        subtotal: (pp.precioCongelado + conMods) * pp.cantidad,
      })
    }
  }
  const combos = [...grupos.values()].map((g) => ({
    ...g,
    cantidad: g.filas[0]?.cantidad,
    subtotal: (g.comboPrecioCongelado ?? 0) * (g.filas[0]?.cantidad || 0),
  }))
  return [...combos, ...normales]
}

// Convierte el ítem personalizado (modificadores con objeto completo, sabores
// con {id}, etc.) al formato que espera el backend en agregarProductos, igual
// al payload que construye NuevoPedidoPage al crear un pedido desde cero.
function normalizarItemParaBackend(item) {
  const normalizarModificador = (m) => ({
    modificadorId: m.id ?? m.modificadorId,
  })
  if (item.comboId) {
    return {
      comboId: item.comboId,
      cantidad: item.cantidad,
      nota: item.nota ?? '',
      productos: (item.productos || []).map((p) => ({
        productoId: p.productoId,
        nota: p.nota ?? '',
        modificadores: (p.modificadores || []).map(normalizarModificador),
      })),
    }
  }
  return {
    productoId: item.productoId,
    cantidad: item.cantidad,
    esMitadYMitad: item.esMitadYMitad || false,
    ...(item.esMitadYMitad && item.sabor1 && item.sabor2
      ? { sabor1ProductoId: item.sabor1.id, sabor2ProductoId: item.sabor2.id }
      : {}),
    modificadores: (item.modificadores || []).map(normalizarModificador),
    nota: item.nota ?? '',
  }
}

function ModalRepartidor({ disponibles, onSeleccionar, onCancelar }) {
  const [seleccionado, setSeleccionado] = useState(disponibles[0]?.id ?? null)

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [onCancelar])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative max-h-[88vh] w-full max-w-lg animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card px-6 pb-6 pt-4 shadow-card">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
        <h2 className="text-xl font-bold text-ink">Asignar repartidor</h2>
        <p className="mt-1 text-sm text-muted">
          El pedido a domicilio necesita un repartidor disponible para pasar a Enviado.
        </p>

        {disponibles.length === 0 ? (
          <p className="mt-4 rounded-2xl bg-surface px-4 py-6 text-center text-sm text-muted">
            No hay repartidores disponibles en este momento. Elige cómo proceder.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {disponibles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSeleccionado(r.id)}
                aria-pressed={seleccionado === r.id}
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  seleccionado === r.id ? 'bg-accent/10' : 'bg-surface'
                }`}
              >
                <span className="block text-sm font-semibold text-ink">{r.nombre}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={disponibles.length === 0 || seleccionado == null}
            onClick={() => onSeleccionar(Number(seleccionado))}
          >
            Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}

function ModalAgregar({ productos, combos, cargando, error, onReintentar, onAgregar, onCancelar }) {
  const [tipo, setTipo] = useState('producto')
  const [seleccionId, setSeleccionId] = useState(null)
  const [cantidad, setCantidad] = useState(1)
  const [personalizandoProducto, setPersonalizandoProducto] = useState(null)
  const [personalizandoCombo, setPersonalizandoCombo] = useState(null)

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [onCancelar])

  const opciones = tipo === 'producto' ? productos : combos
  const seleccionado = opciones?.find((o) => o.id === seleccionId)
  const productosMitad = (productos || []).filter((p) => p.permiteMitadYMitad)

  const finalizar = (config) => {
    onAgregar({ ...config, cantidad })
  }

  const continuar = () => {
    if (!seleccionado) return
    if (tipo === 'producto') setPersonalizandoProducto(seleccionado)
    else setPersonalizandoCombo(seleccionado)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative max-h-[88vh] w-full max-w-lg animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card px-6 pb-6 pt-4 shadow-card">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
        <h2 className="text-xl font-bold text-ink">Agregar al pedido</h2>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-input p-1">
          {[
            { id: 'producto', etiqueta: 'Producto' },
            { id: 'combo', etiqueta: 'Combo' },
          ].map((op) => {
            const activo = tipo === op.id
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => {
                  setTipo(op.id)
                  setSeleccionId(null)
                }}
                aria-pressed={activo}
                className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                  activo ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
                }`}
              >
                {op.etiqueta}
              </button>
            )
          })}
        </div>

        <div className="mt-4">
          <label>
            <span className="mb-1 block text-xs font-medium text-muted">
              {tipo === 'producto' ? 'Producto' : 'Combo'}
            </span>
            {cargando ? (
              <div className="flex items-center gap-3 rounded-2xl bg-input px-4 py-3 text-sm text-muted">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
                Cargando productos…
              </div>
            ) : (
              <select
                value={seleccionId ?? ''}
                onChange={(e) => setSeleccionId(e.target.value ? Number(e.target.value) : null)}
                disabled={!opciones || opciones.length === 0}
                className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
              >
                <option value="" disabled>
                  Elige uno
                </option>
                {(opciones || []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre} — {formatearMonto(tipo === 'producto' ? o.precio : o.precioEspecial)}
                  </option>
                ))}
              </select>
            )}
          </label>
          {error && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-danger/10 px-3 py-2">
              <span className="text-sm font-medium text-danger">{error}</span>
              <button
                type="button"
                onClick={onReintentar}
                className="shrink-0 rounded-full bg-danger px-3 py-1 text-xs font-semibold text-white transition active:scale-95"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted">Cantidad</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              disabled={cantidad <= 1}
              aria-label="Disminuir cantidad"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-input text-ink transition active:scale-95 disabled:opacity-40"
            >
              -
            </button>
            <span className="w-12 text-center text-xl font-bold text-ink">{cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad((c) => c + 1)}
              aria-label="Aumentar cantidad"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white transition active:scale-95"
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button size="md" className="flex-1" disabled={cargando || !seleccionado} onClick={continuar}>
            Continuar
          </Button>
        </div>
      </div>

      {personalizandoProducto && (
        <ModalProducto
          producto={personalizandoProducto}
          productosMitad={productosMitad}
          onCancelar={() => setPersonalizandoProducto(null)}
          onAgregar={finalizar}
        />
      )}
      {personalizandoCombo && (
        <ModalCombo
          combo={personalizandoCombo}
          onCancelar={() => setPersonalizandoCombo(null)}
          onAgregar={finalizar}
        />
      )}
    </div>
  )
}

function ModalActualizarMonto({ esDomicilio, montoActual, total, onConfirmar, onCancelar }) {
  const { config } = useConfiguracion()
  const [modoOtro, setModoOtro] = useState(false)
  const [monto, setMonto] = useState(esDomicilio ? null : '')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [onCancelar])

  const opcionesCambio =
    Array.isArray(config?.opcionesCambio) && config.opcionesCambio.length > 0
      ? config.opcionesCambio
      : [50, 100, 200, 500]
  const opcionMasAlta = opcionesCambio.length > 0 ? Math.max(...opcionesCambio) : 0
  const opciones = opcionesCambio.filter((o) => o >= total)
  const permiteOtroDomicilio = esDomicilio && total > opcionMasAlta

  const confirmar = async () => {
    setError('')
    const valor = esDomicilio && !modoOtro ? monto : Number(monto)
    if (esDomicilio && !modoOtro ? valor == null : !Number.isFinite(valor)) {
      setError('Elige o indica el monto con el que pagará el cliente')
      return
    }
    if (valor < total) {
      setError('El monto debe cubrir el total del pedido')
      return
    }
    // Para domicilio el monto debe estar dentro de las opciones configuradas,
    // salvo que el total SUPERE la opción más alta (regla "Otro").
    if (esDomicilio && !modoOtro && !opcionesCambio.includes(valor)) {
      setError('Para domicilio, el monto debe estar dentro de las opciones de cambio configuradas')
      return
    }
    setEnviando(true)
    try {
      await onConfirmar(valor)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative max-h-[88vh] w-full max-w-lg animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card px-6 pb-6 pt-4 shadow-card">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
        <h2 className="text-xl font-bold text-ink">Actualizar monto de pago</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          El total del pedido ahora es <span className="font-semibold text-ink">{formatearMonto(total)}</span> y el
          monto con el que pagaba el cliente ({formatearMonto(montoActual)}) ya no lo cubre. Indica el nuevo monto.
        </p>

        {esDomicilio && (
          <div className="mt-4">
            <span className="mb-1 block text-xs font-medium text-muted">
              Monto del cliente (opciones de cambio)
            </span>
            <div className="flex flex-wrap gap-2">
              {opciones.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    setModoOtro(false)
                    setMonto(o)
                  }}
                  className={`rounded-2xl px-5 py-3 text-base font-bold transition active:scale-95 ${
                    monto === o && !modoOtro
                      ? 'bg-accent text-white shadow-card'
                      : 'bg-input text-ink hover:bg-muted/20'
                  }`}
                >
                  {formatearMonto(o)}
                </button>
              ))}
              {permiteOtroDomicilio && (
                <button
                  type="button"
                  onClick={() => {
                    setModoOtro(true)
                    setMonto(null)
                  }}
                  aria-pressed={modoOtro}
                  className={`rounded-2xl px-5 py-3 text-base font-bold transition active:scale-95 ${
                    modoOtro
                      ? 'bg-accent text-white shadow-card'
                      : 'bg-input text-ink hover:bg-muted/20'
                  }`}
                >
                  Otro
                </button>
              )}
            </div>
            {!permiteOtroDomicilio && opciones.length === 0 && (
              <p className="text-sm text-danger">
                Ninguna opción configurada cubre el total. Ajusta las opciones de cambio en Configuración.
              </p>
            )}
          </div>
        )}

        {(!esDomicilio || modoOtro) && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="monto-nuevo">
              Monto con el que paga el cliente
            </label>
            <input
              id="monto-nuevo"
              className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
              type="number"
              min={total}
              step="any"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button
            size="md"
            className="flex-1"
            disabled={enviando || (esDomicilio && monto == null)}
            onClick={confirmar}
          >
            {enviando ? 'Guardando…' : 'Actualizar y continuar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Cuántas unidades de cada línea ya se devolvieron (soporta devoluciones
// parciales por CANTIDAD: cada devolución guarda las cantidades en
// cantidadesVentaProducto; los registros viejos sin cantidades se interpretan
// como la línea completa devuelta).
function cantidadesYaDevueltasPorLinea(venta) {
  const mapa = new Map()
  const cantidadesLinea = new Map((venta.productos || []).map((vp) => [vp.id, vp.cantidad || 0]))
  for (const d of venta.devoluciones || []) {
    let ids = []
    try {
      ids = JSON.parse(d.ventaProductoIds || '[]').map(Number)
    } catch {
      continue
    }
    if (ids.length === 0) continue
    let cants = {}
    try {
      cants = JSON.parse(d.cantidadesVentaProducto || '{}')
    } catch {
    }
    for (const id of ids) {
      const previamente = cants[id] ?? cantidadesLinea.get(id) ?? 0
      mapa.set(id, (mapa.get(id) || 0) + previamente)
    }
  }
  return mapa
}

function ModalDevolucion({ venta, onConfirmar, onCancelar }) {
  const montoYaDevuelto = (venta.devoluciones || []).reduce((a, d) => a + d.monto, 0)
  const montoRestante = Math.max(0, (venta.total ?? 0) - montoYaDevuelto)
  const devueltasPorLinea = cantidadesYaDevueltasPorLinea(venta)
  const pendienteDe = (id) => {
    const vp = (venta.productos || []).find((p) => p.id === id)
    return Math.max(0, (vp?.cantidad || 0) - (devueltasPorLinea.get(id) || 0))
  }
  const nombreDe = (id) => {
    const vp = (venta.productos || []).find((p) => p.id === id)
    return vp?.producto?.nombre || (vp?.combo ? `Combo: ${vp.combo.nombre}` : `#${id}`)
  }
  const [modo, setModo] = useState(() => (montoYaDevuelto > 0 ? 'productos' : 'toda'))
  const [seleccion, setSeleccion] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [monto, setMonto] = useState(() =>
    montoYaDevuelto > 0 ? '' : String(montoRestante),
  )
  const [motivo, setMotivo] = useState(MOTIVOS_DEVOLUCION[0].id)
  const [regresaAInventario, setRegresaAInventario] = useState(false)
  const [medioDevolucion, setMedioDevolucion] = useState(() =>
    venta.noCobrar || !MEDIOS_DEVOLUCION.some((m) => m.id === venta.metodoPago)
      ? 'Efectivo_de_caja'
      : venta.metodoPago,
  )
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [onCancelar])

  const cambiarModo = (nuevo) => {
    setModo(nuevo)
    setError('')
    if (nuevo === 'toda') {
      setSeleccion([])
      setCantidades({})
      setMonto(String(montoRestante))
    } else {
      setMonto('')
    }
  }

  const recalcularMonto = (ids, cants) =>
    String(
      (venta.productos || [])
        .filter((vp) => ids.includes(vp.id))
        .reduce(
          (acc, vp) => acc + (vp.precioCongelado || 0) * ((cants[vp.id] ?? pendienteDe(vp.id)) || 0),
          0,
        ),
    )

  const alternarProducto = (id) => {
    const pend = pendienteDe(id)
    if (pend <= 0) return
    const yaSeleccionado = seleccion.includes(id)
    const nuevo = yaSeleccionado ? seleccion.filter((x) => x !== id) : [...seleccion, id]
    const cants = yaSeleccionado ? cantidades : { ...cantidades, [id]: pend }
    setSeleccion(nuevo)
    setCantidades(cants)
    setMonto(nuevo.length === 0 ? '' : recalcularMonto(nuevo, cants))
  }

  const cambiarCantidad = (id, valor) => {
    const cants = { ...cantidades, [id]: valor }
    setCantidades(cants)
    setMonto(recalcularMonto(seleccion, cants))
  }

  const ajustarCantidad = (id, delta) => {
    const limite = pendienteDe(id)
    const actual = Number(cantidades[id] ?? limite) || 1
    cambiarCantidad(id, String(Math.min(limite, Math.max(1, actual + delta))))
  }

  const confirmar = async () => {
    setError('')
    if (modo !== 'toda') {
      if (seleccion.length === 0) {
        setError('Selecciona al menos un producto de la venta')
        return
      }
      for (const id of seleccion) {
        const valor = cantidades[id]
        const numero = Number(valor)
        const pend = pendienteDe(id)
        if (valor === '' || !Number.isInteger(numero) || numero < 1) {
          setError('Indica una cantidad válida (entero mayor o igual a 1) para cada producto.')
          return
        }
        if (numero > pend) {
          setError(`Solo quedan ${pend} unidad(es) por devolver de "${nombreDe(id)}" (máximo ${pend}).`)
          return
        }
      }
    }
    const montoFinal = Number(monto)
    if (!Number.isFinite(montoFinal) || montoFinal <= 0) {
      setError('Indica un monto a devolver mayor o igual a 0')
      return
    }
    if (montoFinal > montoRestante) {
      setError(
        `El monto a devolver (${formatearMonto(montoFinal)}) excede lo que falta de la venta (${formatearMonto(montoRestante)})`,
      )
      return
    }
    setEnviando(true)
    try {
      await onConfirmar({
        ventaId: venta.id,
        monto: montoFinal,
        motivo,
        regresaAInventario,
        medioDevolucion,
        ventaProductoIds: modo === 'toda' ? undefined : seleccion,
        cantidades:
          modo === 'toda'
            ? undefined
            : Object.fromEntries(seleccion.map((id) => [id, Number(cantidades[id])])),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative max-h-[88vh] w-full max-w-lg animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card px-6 pb-6 pt-4 shadow-card">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
        <h2 className="text-xl font-bold text-ink">Registrar devolución</h2>
        <p className="mt-1 text-sm text-muted">
          Venta #{venta.id} · pagada con {venta.metodoPago}
        </p>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted">Producto(s) a devolver</span>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => cambiarModo('toda')}
              aria-pressed={modo === 'toda'}
              disabled={montoYaDevuelto > 0}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                modo === 'toda' ? 'bg-accent/10' : 'bg-surface'
              }`}
            >
              <span className="text-sm font-semibold text-ink">Toda la venta</span>
              <span className="text-sm font-bold text-ink">{formatearMonto(venta.total)}</span>
            </button>
            {montoYaDevuelto > 0 && (
              <p className="text-xs text-amber-600">
                Hay devoluciones parciales: selecciona solo los productos pendientes.
              </p>
            )}
            {(venta.productos || []).map((vp) => {
              const pend = pendienteDe(vp.id)
              const agotado = pend <= 0
              const activo = modo === 'productos' && seleccion.includes(vp.id)
              const nombre = nombreDe(vp.id)
              const parcial = pend < (vp.cantidad || 1)
              return (
                <div
                  key={vp.id}
                  className={`rounded-2xl transition ${activo ? 'bg-accent/10' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (agotado) return
                      cambiarModo('productos')
                      alternarProducto(vp.id)
                    }}
                    aria-pressed={activo}
                    disabled={agotado}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      activo ? '' : 'bg-surface'
                    }`}
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">
                      {vp.cantidad}× {nombre}
                      {agotado ? (
                        <span className="ml-2 text-xs font-medium text-muted">· ya devuelta</span>
                      ) : (
                        parcial && <span className="ml-2 text-xs font-medium text-amber-600">· quedan {pend}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-ink">
                      {formatearMonto((vp.precioCongelado || 0) * (vp.cantidad || 0))}
                    </span>
                  </button>
                  {activo && (
                    <div className="flex items-center justify-between gap-3 px-4 pb-3">
                      <span className="text-xs font-medium text-muted">¿Cuántas unidades?</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => ajustarCantidad(vp.id, -1)}
                          disabled={Number(cantidades[vp.id]) <= 1}
                          aria-label="Disminuir cantidad a devolver"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink transition disabled:opacity-40"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={pend}
                          inputMode="numeric"
                          value={cantidades[vp.id]}
                          onChange={(e) => cambiarCantidad(vp.id, e.target.value)}
                          aria-label={`Cantidad a devolver de ${nombre}`}
                          className="h-9 w-14 rounded-xl border-none bg-surface text-center text-base font-bold text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
                        />
                        <button
                          type="button"
                          onClick={() => ajustarCantidad(vp.id, 1)}
                          disabled={Number(cantidades[vp.id]) >= pend}
                          aria-label="Aumentar cantidad a devolver"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg font-bold text-ink transition disabled:opacity-40"
                        >
                          +
                        </button>
                        <span className="w-16 text-xs text-muted">de {pend}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor="dev-monto">
            Monto a devolver
          </label>
          {montoYaDevuelto > 0 && (
            <p className="mb-2 text-sm text-amber-600">
              Ya se devolvieron {formatearMonto(montoYaDevuelto)} de esta venta. Quedan {formatearMonto(montoRestante)}.
            </p>
          )}
          <input
            id="dev-monto"
            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
            type="number"
            min="0"
            max={montoRestante}
            step="any"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
          />
</div>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted">Motivo</span>
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
          >
            {MOTIVOS_DEVOLUCION.map((m) => (
              <option key={m.id} value={m.id}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink">¿Regresar al inventario?</span>
          <input
            type="checkbox"
            checked={regresaAInventario}
            onChange={(e) => setRegresaAInventario(e.target.checked)}
            className="h-5 w-5 accent-[#007aff]"
          />
        </label>

        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted">Medio de devolución</span>
          <select
            value={medioDevolucion}
            onChange={(e) => setMedioDevolucion(e.target.value)}
            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
          >
            {MEDIOS_DEVOLUCION.map((m) => (
              <option key={m.id} value={m.id}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button size="md" className="flex-1" disabled={enviando} onClick={confirmar}>
            {enviando ? 'Registrando…' : 'Registrar devolución'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Modal para elegir el medio al devolver el dinero de un Pedido Pagado que se
// está cancelando (mismo selector que el modal de "Registrar devolución").
// El medio NO se predetermina al método de pago original: el usuario debe
// elegirlo explícitamente (salvo pedidos noCobrar, donde no hay dinero real).
function ModalMedioDevolucion({ monto, noCobrar, onConfirmar, onCancelar }) {
  const [medioDevolucion, setMedioDevolucion] = useState(noCobrar ? 'Efectivo_de_caja' : '')

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cerrarConEsc = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    window.addEventListener('keydown', cerrarConEsc)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEsc)
    }
  }, [onCancelar])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative w-full max-w-md animate-[sheet-up_280ms_ease-out] rounded-3xl bg-card p-6 shadow-card">
        <h2 className="text-lg font-bold text-ink">Devolver el dinero</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          El pedido se cancelará y se registrará una devolución total de{' '}
          <span className="font-semibold text-ink">{formatearMonto(monto)}</span>. Elige el medio de
          devolución:
        </p>
        <div className="mt-4">
          <span className="mb-1 block text-xs font-medium text-muted">Medio de devolución</span>
          <select
            value={medioDevolucion}
            onChange={(e) => setMedioDevolucion(e.target.value)}
            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
          >
            <option value="" disabled>
              Selecciona el medio de devolución
            </option>
            {MEDIOS_DEVOLUCION.map((m) => (
              <option key={m.id} value={m.id}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button size="md" className="flex-1" disabled={!medioDevolucion} onClick={() => onConfirmar(medioDevolucion)}>
            Devolver y cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}

function DetallePedidoPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pedido, setPedido] = useState(null)
  const [error, setError] = useState('')
  const [stockFaltante, setStockFaltante] = useState(null)
  const [notificacion, setNotificacion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [modalRepartidor, setModalRepartidor] = useState(false)
  const [repartidores, setRepartidores] = useState([])
  const [modalAgregar, setModalAgregar] = useState(false)
  const [edicionActiva, setEdicionActiva] = useState(false)
  const [productos, setProductos] = useState(null)
  const [combos, setCombos] = useState(null)
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false)
  const [errorCatalogo, setErrorCatalogo] = useState('')
  const catalogoEnCurso = useRef(false)
  const [confirmarCancelarAbierto, setConfirmarCancelarAbierto] = useState(false)
  const [regresoPendiente, setRegresoPendiente] = useState(null)
  const [devolverDineroPendiente, setDevolverDineroPendiente] = useState(null)
  const [modalMedioDevolucion, setModalMedioDevolucion] = useState(null)
  const [pendienteMonto, setPendienteMonto] = useState(null)
  const [pendienteStock, setPendienteStock] = useState(null)
  const [pendientePagoStock, setPendientePagoStock] = useState(false)
  const [modalDevolucion, setModalDevolucion] = useState(null)
  const [ventaInfo, setVentaInfo] = useState(null)

  const cargar = useCallback(async () => {
    setError('')
    setNotificacion('')
    try {
      const datos = await obtenerPedido(id)
      setPedido(datos)
      if (datos?.venta?.id) {
        try {
          const detalle = await obtenerVenta(datos.venta.id)
          setVentaInfo(detalle)
        } catch {
          setVentaInfo(null)
        }
      } else {
        setVentaInfo(null)
      }
    } catch (err) {
      setError(err.message)
    }
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  const lineas = useMemo(() => (pedido ? construirLineas(pedido) : []), [pedido])

  const productosNoDisponibles = useMemo(() => {
    if (!pedido) return []
    const vistos = new Map()
    for (const pp of pedido.productos || []) {
      const disponible = pp.producto?.disponibleHoy === true && pp.producto?.estado !== 'Inactivo'
      if (!disponible && pp.producto && !vistos.has(pp.productoId)) {
        vistos.set(pp.productoId, pp.producto.nombre || `#${pp.productoId}`)
      }
    }
    return [...vistos.values()]
  }, [pedido])

  const estado = pedido ? CONFIG_ESTADOS[pedido.estadoPreparacion] || CONFIG_ESTADOS.Cancelado : null
  const pago = pedido ? CONFIG_PAGO[pedido.estadoPago] || CONFIG_PAGO.Pendiente_pago : null

  const enPendiente = pedido?.estadoPreparacion === 'Pendiente'
  const enPreparacion = pedido?.estadoPreparacion === 'En_preparacion'
  const enEnviado = pedido?.estadoPreparacion === 'Enviado'
  const enEntregado = pedido?.estadoPreparacion === 'Entregado'
  const editable = enPendiente || enPreparacion
  const esDomicilio = pedido?.tipo === 'A_domicilio'
  const pendienteDePago = pedido?.estadoPago === 'Pendiente_pago'
  const cancelable = enPendiente || enPreparacion || enEnviado

  const correr = async (tarea, mensajeExito) => {
    if (ocupado) return
    setOcupado(true)
    setError('')
    setNotificacion('')
    try {
      const res = await tarea()
      if (res?.pedido) setPedido(res.pedido)
      if (mensajeExito) setNotificacion(mensajeExito)
      return res
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  const pausar = () => {
    correr(
      () => cambiarEstadoPreparacion(id, { estadoPreparacion: 'En_preparacion' }),
      'Pedido en preparación',
    )
  }

  const marcarEnviado = () => {
    if (pedido.repartidor) {
      correr(
        () =>
          cambiarEstadoPreparacion(id, {
            estadoPreparacion: 'Enviado',
            repartidorId: pedido.repartidor.id,
          }),
        'Pedido enviado',
      )
    } else {
      setError('')
      setNotificacion('')
      obtenerRepartidoresDisponibles()
        .then((disponibles) => {
          setRepartidores(disponibles)
          setModalRepartidor(true)
        })
        .catch((err) => setError(err.message))
    }
  }

  const marcarEntregado = () => {
    correr(
      () => cambiarEstadoPreparacion(id, { estadoPreparacion: 'Entregado' }),
      'Pedido entregado',
    )
  }

  const enviarConRepartidor = (repartidorId) => {
    setModalRepartidor(false)
    correr(
      () =>
        cambiarEstadoPreparacion(id, {
          estadoPreparacion: 'Enviado',
          repartidorId,
        }),
      'Pedido enviado',
    )
  }

  const iniciarCancelar = () => {
    if (ocupado) return
    setConfirmarCancelarAbierto(true)
  }

  const confirmarCancelacion = () => {
    setConfirmarCancelarAbierto(false)
    setRegresoPendiente({ tipo: 'cancelar' })
  }

  // Resuelve la pregunta de inventario tras confirmar una cancelación o un
  // quitar-ítem. `regresa` = true cuando se pulsa "Sí, regresar".
  const ejecutarCancelacion = (regresa, devolverDinero = false, medioDevolucion = null) => {
    correr(
      () =>
        cambiarEstadoPreparacion(id, {
          estadoPreparacion: 'Cancelado',
          regresaAInventario: regresa,
          ...(devolverDinero ? { devolverDinero: true, medioDevolucion } : {}),
        }),
      devolverDinero
        ? 'Pedido cancelado y dinero devuelto'
        : regresa
          ? 'Pedido cancelado y regresado a inventario'
          : 'Pedido cancelado (sin regreso a inventario)',
    ).then((res) => {
      if (res) {
        setEdicionActiva(false)
        cargar()
      }
    })
  }

  const resolverRegreso = (regresa) => {
    const pendiente = regresoPendiente
    setRegresoPendiente(null)
    if (!pendiente) return
    if (pendiente.tipo === 'cancelar') {
      if (pedido?.estadoPago === 'Pagado') {
        // Pedido pagado: además de la pregunta de inventario, se pregunta si
        // se devuelve el dinero (sí/no) y, en caso afirmativo, por qué medio.
        setDevolverDineroPendiente({ regresa })
        return
      }
      ejecutarCancelacion(regresa, false)
      return
    }
    const linea = pendiente.linea
    const ids =
      linea.tipo === 'combo'
        ? linea.pedidoProductoIds.map((pedidoProductoId) => ({
            pedidoProductoId,
            regresaAInventario: regresa,
          }))
        : [{ pedidoProductoId: linea.pedidoProductoId, regresaAInventario: regresa }]
    correr(
      () => editarPedido(id, { quitarProductos: ids }),
      'Producto quitado y total recalculado',
    ).then((res) => {
      if (res && lineas.length === 1) setEdicionActiva(false)
    })
  }

  const iniciarQuitar = (linea) => {
    if (ocupado) return
    setRegresoPendiente({ tipo: 'quitar', linea })
  }

  const cargarCatalogo = async () => {
    if (catalogoEnCurso.current) return
    catalogoEnCurso.current = true
    setCargandoCatalogo(true)
    setErrorCatalogo('')
    try {
      const [p, c] = await Promise.all([
        productos === null ? obtenerProductos() : Promise.resolve(productos),
        combos === null ? obtenerCombos() : Promise.resolve(combos),
      ])
      setProductos(p)
      setCombos(c.filter((combo) => combo.estado === 'Activo'))
    } catch (err) {
      setErrorCatalogo(err.message)
    } finally {
      catalogoEnCurso.current = false
      setCargandoCatalogo(false)
    }
  }

  const abrirAgregar = () => {
    setError('')
    setModalAgregar(true)
    if (productos === null || combos === null) cargarCatalogo()
  }

  const ejecutarEdicion = async (operacion, montoReferenciaPago, usarDisponible = false) => {
    if (ocupado) return null
    setOcupado(true)
    setError('')
    setStockFaltante(null)
    setNotificacion('')
    try {
      const res = await editarPedido(
        id,
        usarDisponible
          ? { ...operacion, usarDisponible: true, ...(montoReferenciaPago !== undefined ? { montoReferenciaPago } : {}) }
          : montoReferenciaPago !== undefined
            ? { ...operacion, montoReferenciaPago }
            : operacion,
      )
      if (res?.pedido) setPedido(res.pedido)
      setEdicionActiva(true)
      setNotificacion('Producto agregado y total recalculado')
      return res
    } catch (err) {
      if (err.stockInsuficiente) {
        setStockFaltante(err.stockInsuficiente)
        setPendienteStock({ operacion, montoReferenciaPago })
      } else setError(err.message)
      if (err.nuevoTotal != null) {
        setPendienteMonto({ operacion, nuevoTotal: err.nuevoTotal })
      }
      return null
    } finally {
      setOcupado(false)
    }
  }

  const agregarLinea = (item) => {
    const nuevo = item.tipoLinea
      ? item
      : item.comboId
        ? {
            tipoLinea: 'combo',
            comboId: item.comboId,
            nota: item.nota ?? '',
            productos: item.productos || [],
            cantidad: item.cantidad,
          }
        : {
            tipoLinea: 'producto',
            productoId: item.productoId,
            esMitadYMitad: item.esMitadYMitad || false,
            sabor1: item.sabor1 || null,
            sabor2: item.sabor2 || null,
            modificadores: item.modificadores || [],
            nota: item.nota ?? '',
            cantidad: item.cantidad,
          }
    const coincidencia = lineas.find((l) => esMismaConfiguracion(l, nuevo))
    const operacion = coincidencia
      ? {
          actualizarProductos:
            coincidencia.tipoLinea === 'combo'
              ? [
                  {
                    comboId: coincidencia.comboId,
                    cantidad: coincidencia.cantidad + nuevo.cantidad,
                  },
                ]
              : [
                  {
                    pedidoProductoId: coincidencia.pedidoProductoId,
                    cantidad: coincidencia.cantidad + nuevo.cantidad,
                  },
                ],
        }
      : { agregarProductos: [normalizarItemParaBackend(item)] }
    setModalAgregar(false)
    ejecutarEdicion(operacion)
  }

  const confirmarNuevoMonto = async (monto) => {
    const pendiente = pendienteMonto
    if (!pendiente) return
    const res = await ejecutarEdicion(pendiente.operacion, monto)
    if (res) setPendienteMonto(null)
    else throw new Error('No se pudo actualizar el pedido con el nuevo monto')
  }

  const marcarPagado = async (usarDisponible = false) => {
    if (ocupado) return
    setOcupado(true)
    setError('')
    setNotificacion('')
    setStockFaltante(null)
    try {
      const res = await cambiarEstadoPago(id, {
        estadoPago: 'Pagado',
        ...(usarDisponible ? { usarDisponible: true } : {}),
      })
      setPendientePagoStock(false)
      if (res?.pedido) setPedido(res.pedido)
      setNotificacion('Pedido pagado. Venta generada.')
      return res
    } catch (err) {
      // Pedido creado antes del rediseño de reserva (sin movimientos de
      // inventario reservados): al pagarse se valida el stock como una venta
      // normal; si no alcanza, se ofrece "usar lo disponible" para continuar.
      if (err.stockInsuficiente) {
        setStockFaltante(err.stockInsuficiente)
        setPendientePagoStock(true)
      } else {
        setError(err.message)
      }
      return null
    } finally {
      setOcupado(false)
    }
  }

  const puedeDevolver = enEntregado && pedido?.venta?.id != null

  const montoDevueltoVenta = (ventaInfo?.devoluciones || []).reduce((a, d) => a + d.monto, 0)
  const productosYaDevueltos = new Set(
    (ventaInfo?.devoluciones || []).flatMap((d) => {
      try {
        return JSON.parse(d.ventaProductoIds || '[]')
      } catch {
        return []
      }
    }),
  )
  const todosProductosDevueltos =
    ventaInfo != null &&
    (ventaInfo.productos?.length || 0) > 0 &&
    (ventaInfo.productos || []).every((vp) => productosYaDevueltos.has(vp.id))
  // Solo se deshabilita el botón cuando TODA la venta quedó devuelta (monto
  // cubierto en su totalidad o todos los productos marcados como devueltos).
  // Si solo se devolvió parte (ej. la torta), queda disponible para lo pendiente.
  const ventaTotalmenteDevuelta =
    ventaInfo != null &&
    ((ventaInfo.total ?? 0) > 0 && montoDevueltoVenta >= (ventaInfo.total ?? 0) ? true : todosProductosDevueltos)

  const abrirDevolucion = async () => {
    setError('')
    setNotificacion('')
    try {
      const ventaDetalle = await obtenerVenta(pedido.venta.id)
      setModalDevolucion(ventaDetalle)
    } catch (err) {
      setError(err.message)
    }
  }

  const confirmarDevolucion = async (payload) => {
    const res = await registrarDevolucion(payload)
    setModalDevolucion(null)
    setNotificacion(
      res.mensaje ||
        (res.asociadaASiguienteDia
          ? 'Devolución registrada (se asociará a la próxima caja)'
          : 'Devolución registrada'),
    )
    cargar()
  }

  const nombreCliente = pedido
    ? pedido.cliente?.nombre || pedido.nombreClienteLibre || 'Sin nombre'
    : ''

  const referenciaEntrega =
    pedido?.tipo === 'A_domicilio'
      ? pedido.referencia?.descripcion || pedido.referenciaLibre || '—'
      : null

  if (error && !pedido) {
    return (
      <main className="min-h-screen bg-surface pb-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-4 py-24 text-center">
          <p className="font-medium text-danger">{error}</p>
          <Button variant="secondary" size="md" onClick={cargar}>
            Reintentar
          </Button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm font-semibold text-accent"
          >
            Volver a pedidos
          </button>
        </div>
      </main>
    )
  }

  if (!pedido) {
    return (
      <main className="min-h-screen bg-surface pb-16">
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
          <p className="text-sm">Cargando pedido…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface pb-16">
      <header className="sticky top-0 z-30 border-b border-muted/10 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Volver a Pedidos"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-card transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <IconoFlechaIzquierda />
          </button>
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">
            Pedido #{pedido.id}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <BannerToaster
          error={error}
          notificacion={notificacion}
          onCerrarError={() => setError('')}
          onCerrarNotificacion={() => setNotificacion('')}
        />
        {error && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        {stockFaltante?.length > 0 && (
          <div className="space-y-1.5 rounded-2xl bg-danger/5 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-danger">Stock insuficiente</p>
            {stockFaltante.map((f) => (
              <p key={`${f.tipo}-${f.id}`} className="text-sm text-ink">
                {f.nombre}: requerido {f.requerido} · disponible {f.disponible}
              </p>
            ))}
            {pendienteStock && (
              <button
                type="button"
                className="mt-1 w-full rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={ocupado}
                onClick={() =>
                  ejecutarEdicion(pendienteStock.operacion, pendienteStock.montoReferenciaPago, true)
                }
              >
                {ocupado ? 'Enviando…' : 'Usar lo disponible'}
              </button>
            )}
            {pendientePagoStock && (
              <button
                type="button"
                className="mt-1 w-full rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={ocupado}
                onClick={() => marcarPagado(true)}
              >
                {ocupado ? 'Procesando…' : 'Usar lo disponible'}
              </button>
            )}
          </div>
        )}
        {notificacion && (
          <div className="rounded-2xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700">
            {notificacion}
          </div>
        )}
        {(enPendiente || enPreparacion) && productosNoDisponibles.length > 0 && (
          <div className="space-y-1.5 rounded-2xl bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-600">
              Producto no disponible
            </p>
            <p className="text-sm text-ink">
              No podrás marcar este pedido como Pagado hasta que vuelvan a estar
              disponibles:
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-700">
              {productosNoDisponibles.map((nombre) => (
                <li key={nombre}>{nombre}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="rounded-3xl bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-ink">{nombreCliente}</h2>
              <p className="text-sm text-muted">
                {ETIQUETA_TIPO[pedido.tipo]} · {ETIQUETA_ORIGEN[pedido.origen]} ·{' '}
                {formatHora(pedido.fechaHoraCreacion)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {estado && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${estado.fondo} ${estado.texto}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${estado.punto}`} />
                  {estado.etiqueta}
                </span>
              )}
              {pago && (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${pago.fondo} ${pago.texto}`}
                >
                  {pago.etiqueta}
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-x-8 gap-y-1 border-t border-muted/10 pt-2 sm:grid-cols-2">
            <FilaInfo etiqueta="Cliente" valor={nombreCliente} />
            <FilaInfo etiqueta="Hora" valor={formatHora(pedido.fechaHoraCreacion)} />
            <FilaInfo etiqueta="Tipo" valor={ETIQUETA_TIPO[pedido.tipo]} />
            <FilaInfo etiqueta="Origen" valor={ETIQUETA_ORIGEN[pedido.origen]} />
            <FilaInfo etiqueta="Método de pago" valor={pedido.noCobrar ? 'No cobrar' : pedido.metodoPago} />
            <FilaInfo etiqueta="Estado de pago" valor={pago?.etiqueta} />

            {esDomicilio && (
              <>
                <FilaInfo etiqueta="Referencia de entrega" valor={referenciaEntrega} />
                <FilaInfo
                  etiqueta="Repartidor"
                  valor={pedido.repartidor?.nombre || 'Sin asignar'}
                />
                <FilaInfo etiqueta="Envío" valor={formatearMonto(pedido.costoEnvio)} />
                <FilaInfo
                  etiqueta="Cambio a llevar"
                  valor={formatearMonto(pedido.cambioALlevar)}
                />
              </>
            )}
          </div>
        </section>

        <section>
          <EtiquetaSeccion>Productos y combos</EtiquetaSeccion>
          <div className="rounded-3xl bg-card shadow-card">
            <ul className="divide-y divide-muted/10">
              {lineas.map((linea, idx) => (
                <li key={idx} className="px-5 py-4">
                  {linea.tipo === 'combo' ? (
                    <div className="flex items-start gap-3">
                      <span className="mt-1 shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                        Combo
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink">{linea.nombre}</p>
                            <p className="mt-1 text-xs text-muted">
                              Incluye:{' '}
                              {linea.filas
                                .map((f) => `${f.cantidad}× ${f.producto?.nombre || 'Producto'}`)
                                .join(', ')}
                            </p>
                            {linea.filas.some(
                              (f) => (f.modificadores?.length || 0) > 0 || f.nota,
                            ) && (
                              <ul className="mt-1.5 space-y-0.5">
                                {linea.filas.map((f) => {
                                  const mods = (f.modificadores || [])
                                    .map((m) => m.modificador?.nombre || m.nombre)
                                    .join(', ')
                                  return (
                                    <li key={f.id} className="text-xs text-muted">
                                      <span className="font-semibold text-ink">
                                        {f.producto?.nombre || 'Producto'}
                                        {f.cantidad > 1 ? ` ×${f.cantidad}` : ''}
                                      </span>
                                      {mods ? ` — ${mods}` : ''}
                                      {f.nota ? ` · Nota: ${f.nota}` : ''}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                            {linea.nota && (
                              <p className="mt-1 text-xs italic text-muted">
                                Nota del combo: {linea.nota}
                              </p>
                            )}
                          </div>
                          {edicionActiva &&
                            editable && (
                              <button
                                type="button"
                                onClick={() => iniciarQuitar(linea)}
                                disabled={ocupado}
                                aria-label={`Quitar ${linea.nombre}`}
                                className="shrink-0 rounded-full p-1.5 text-muted transition hover:text-danger active:scale-90 disabled:opacity-40"
                              >
                                <IconoBasura />
                              </button>
                            )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-muted">
                            × {linea.cantidad}
                          </span>
                          <span className="text-sm font-bold text-ink">
                            {formatearMonto(linea.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink">{linea.nombre}</p>
                            <p className="text-xs text-muted">
                              {linea.esMitad && linea.mitad
                                ? `Mitad y mitad: ${linea.mitad.sabor1Producto?.nombre} + ${linea.mitad.sabor2Producto?.nombre}`
                                : `Precio unitario ${formatearMonto(linea.precioUnitario)}`}
                            </p>
                            {linea.modificadores.length > 0 && (
                              <p className="mt-0.5 text-xs text-muted">
                                {linea.modificadores
                                  .map((m) => m.modificador?.nombre || m.nombre)
                                  .join(', ')}
                              </p>
                            )}
                            {linea.nota && (
                              <p className="mt-0.5 text-xs italic text-muted">Nota: {linea.nota}</p>
                            )}
                          </div>
                          {edicionActiva && editable && (
                            <button
                              type="button"
                              onClick={() => iniciarQuitar(linea)}
                              disabled={ocupado}
                              aria-label={`Quitar ${linea.nombre}`}
                              className="shrink-0 rounded-full p-1.5 text-muted transition hover:text-danger active:scale-90 disabled:opacity-40"
                            >
                              <IconoBasura />
                            </button>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-muted">
                            × {linea.cantidad}
                          </span>
                          <span className="text-sm font-bold text-ink">
                            {formatearMonto(linea.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <footer className="border-t border-muted/10 px-5 py-4">
              {esDomicilio && pedido.costoEnvio > 0 && (
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted">Envío</span>
                  <span className="font-semibold text-ink">{formatearMonto(pedido.costoEnvio)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-ink">Total</span>
                <span className="text-xl font-bold text-ink">{formatearMonto(pedido.total)}</span>
              </div>
              {pedido.cambioALlevar != null && (
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted">Cambio a llevar</span>
                  <span className="font-semibold text-accent">
                    {formatearMonto(pedido.cambioALlevar)}
                  </span>
                </div>
              )}
            </footer>
          </div>
        </section>

        {(editable || cancelable || enEntregado) && (
          <section className="rounded-3xl bg-card p-5 shadow-card">
            <EtiquetaSeccion>Acciones</EtiquetaSeccion>
            {esDomicilio && pedido.repartidor && (
              <p className="mb-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
                Este pedido está asignado a{' '}
                <span className="font-semibold text-ink">{pedido.repartidor.nombre}</span>: el
                repartidor gestiona la entrega y el cobro.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {enPendiente && (
                <Button size="md" onClick={pausar} disabled={ocupado}>
                  Pasar a En preparación
                </Button>
              )}
              {enPreparacion && esDomicilio && !pedido.repartidor && (
                <Button size="md" onClick={marcarEnviado} disabled={ocupado}>
                  Marcar Enviado
                </Button>
              )}
              {((enEnviado && esDomicilio) || (enPreparacion && !esDomicilio)) && (
                <Button size="md" onClick={marcarEntregado} disabled={ocupado}>
                  Marcar Entregado
                </Button>
              )}
              {enEntregado && pendienteDePago && !(esDomicilio && pedido.repartidor) && (
                <Button size="md" onClick={() => marcarPagado(false)} disabled={ocupado}>
                  Marcar Pagado
                </Button>
              )}

              {puedeDevolver && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={abrirDevolucion}
                  disabled={ocupado || ventaTotalmenteDevuelta}
                >
                  {ventaTotalmenteDevuelta ? 'Venta ya devuelta' : 'Registrar devolución'}
                </Button>
              )}

              {editable && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setEdicionActiva((v) => !v)}
                  disabled={ocupado}
                >
                  {edicionActiva ? 'Terminar edición' : 'Editar pedido'}
                </Button>
              )}

              {edicionActiva && editable && (
                <Button variant="secondary" size="md" onClick={abrirAgregar} disabled={ocupado}>
                  + Agregar producto
                </Button>
              )}

              {cancelable && (
                <Button size="md" onClick={iniciarCancelar} disabled={ocupado} className="bg-danger text-white active:bg-danger/85">
                  Cancelar pedido
                </Button>
              )}
            </div>
            {ocupado && <p className="mt-3 text-sm text-muted">Procesando…</p>}
          </section>
        )}
      </div>

      {modalRepartidor && (
        <ModalRepartidor
          disponibles={repartidores}
          onSeleccionar={enviarConRepartidor}
          onCancelar={() => setModalRepartidor(false)}
        />
      )}
      {modalDevolucion && (
        <ModalDevolucion
          venta={modalDevolucion}
          onConfirmar={confirmarDevolucion}
          onCancelar={() => setModalDevolucion(null)}
        />
      )}
      {modalAgregar && (
        <ModalAgregar
          productos={productos || []}
          combos={combos || []}
          cargando={cargandoCatalogo}
          error={errorCatalogo}
          onReintentar={cargarCatalogo}
          onAgregar={agregarLinea}
          onCancelar={() => setModalAgregar(false)}
        />
      )}

      {pendienteMonto && (
        <ModalActualizarMonto
          esDomicilio={pedido?.tipo === 'A_domicilio'}
          montoActual={pedido?.montoReferenciaPago}
          total={pendienteMonto.nuevoTotal}
          onConfirmar={confirmarNuevoMonto}
          onCancelar={() => setPendienteMonto(null)}
        />
      )}

      <ConfirmModal
        abierto={confirmarCancelarAbierto}
        titulo="Cancelar pedido"
        mensaje={`¿Seguro que quieres cancelar el pedido #${pedido.id}?`}
        confirmarEtiqueta="Cancelar pedido"
        cancelarEtiqueta="Volver"
        variante="danger"
        onConfirmar={confirmarCancelacion}
        onCancelar={() => setConfirmarCancelarAbierto(false)}
      />

      <ConfirmModal
        abierto={regresoPendiente !== null}
        titulo="Regresar inventario"
        mensaje={
          regresoPendiente?.tipo === 'quitar'
            ? `¿Regresar "${regresoPendiente.linea.nombre}" al inventario?`
            : '¿Los ingredientes se regresan al inventario?'
        }
        confirmarEtiqueta="Sí, regresar"
        cancelarEtiqueta="No regresar"
        extraEtiqueta="Cancelar"
        onExtra={() => setRegresoPendiente(null)}
        onConfirmar={() => resolverRegreso(true)}
        onCancelar={() => resolverRegreso(false)}
      />

      <ConfirmModal
        abierto={devolverDineroPendiente !== null}
        titulo="Devolver el dinero"
        mensaje="¿Deseas devolver el dinero de este pedido? Se cancelará y se registrará una devolución total."
        confirmarEtiqueta="Sí, devolver"
        cancelarEtiqueta="No devolver"
        extraEtiqueta="Cancelar"
        onExtra={() => setDevolverDineroPendiente(null)}
        onConfirmar={() => {
          const pendiente = devolverDineroPendiente
          setDevolverDineroPendiente(null)
          if (pendiente) setModalMedioDevolucion(pendiente)
        }}
        onCancelar={() => {
          const pendiente = devolverDineroPendiente
          setDevolverDineroPendiente(null)
          if (pendiente) ejecutarCancelacion(pendiente.regresa, false)
        }}
      />

      {modalMedioDevolucion && (
        <ModalMedioDevolucion
          monto={pedido?.venta?.total ?? pedido?.total ?? 0}
          noCobrar={pedido?.venta?.noCobrar}
          onConfirmar={(medioDevolucion) => {
            const pendiente = modalMedioDevolucion
            setModalMedioDevolucion(null)
            if (pendiente) ejecutarCancelacion(pendiente.regresa, true, medioDevolucion)
          }}
          onCancelar={() => setModalMedioDevolucion(null)}
        />
      )}
    </main>
  )
}

export default DetallePedidoPage
