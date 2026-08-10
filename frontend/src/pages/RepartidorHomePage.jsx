import { useCallback, useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import { useAuth } from '../context/useAuth'
import {
  cambiarEstadoPago,
  cambiarEstadoPreparacion,
  obtenerPedidosRepartidor,
} from '../services/pedidos'

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

// Un pedido puede marcarse Entregado SOLO desde los estados definidos en la
// matriz de transiciones del backend (docs/06): A_domicilio desde Enviado,
// Para_recoger desde En_preparacion.
function puedeMarcarEntregado(pedido) {
  const transiciones = {
    A_domicilio: { Enviado: ['Entregado'] },
    Para_recoger: { En_preparacion: ['Entregado'] },
  }
  return (transiciones[pedido.tipo]?.[pedido.estadoPreparacion] || []).includes('Entregado')
}

const CONFIG_PAGO = {
  Pagado: {
    etiqueta: 'Pagado',
    punto: 'bg-green-500',
    fondo: 'bg-green-500/10',
    texto: 'text-green-700',
  },
  Pendiente_pago: {
    etiqueta: 'Pendiente de pago',
    punto: 'bg-amber-500',
    fondo: 'bg-amber-500/10',
    texto: 'text-amber-700',
  },
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatearMonto(total) {
  if (total == null) return '—'
  return total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function TarjetaPedido({ pedido, onMarcarEntregar, onCobrar, ocupado }) {
  const estado = CONFIG_ESTADOS[pedido.estadoPreparacion] || CONFIG_ESTADOS.Cancelado
  const pago = CONFIG_PAGO[pedido.estadoPago] || CONFIG_PAGO.Pendiente_pago
  const nombreCliente = pedido.cliente?.nombre || pedido.nombreClienteLibre || 'Sin nombre'
  const referencia =
    pedido.referencia?.descripcion || pedido.referenciaLibre || 'Sin referencia'
  const puedeEntregar = puedeMarcarEntregado(pedido)
  const puedeCobrarPendiente =
    pedido.estadoPreparacion === 'Entregado' &&
    pedido.estadoPago === 'Pendiente_pago' &&
    !pedido.noCobrar
  const [noCobrar, setNoCobrar] = useState(false)

  return (
    <article className="rounded-3xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Pedido #{pedido.id}</p>
          <p className="text-xs text-muted">{formatTime(pedido.fechaHoraCreacion)} h</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${estado.fondo} ${estado.texto}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${estado.punto}`} />
            {estado.etiqueta}
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${pago.fondo} ${pago.texto}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${pago.punto}`} />
            {pago.etiqueta}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <p className="truncate text-base font-semibold text-ink">{nombreCliente}</p>
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <path d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-1.5 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm.75 5.25L13.5 21h-3l-.75-5.25a7.5 7.5 0 1 1 6.75 0Z" />
          </svg>
          <span>{referencia}</span>
        </p>
      </div>

      <div className="mt-4 space-y-1 rounded-2xl bg-surface/70 px-4 py-3">
        <div className="flex items-center justify-between text-base">
          <span className="font-medium text-muted">Total a cobrar</span>
          <span className="font-bold text-ink">{formatearMonto(pedido.total)}</span>
        </div>
        {pedido.cambioALlevar != null && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Cambio a llevar</span>
            <span className="text-2xl font-bold text-accent">
              {formatearMonto(pedido.cambioALlevar)}
            </span>
          </div>
        )}
        {pedido.noCobrar && (
          <p className="text-sm font-semibold text-danger">No cobrar</p>
        )}
      </div>

      {puedeEntregar && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={noCobrar}
              onChange={(e) => setNoCobrar(e.target.checked)}
              className="h-5 w-5 accent-accent"
            />
            Marcar como "No cobrar"
          </label>
          <Button
            size="lg"
            className="w-full"
            disabled={ocupado}
            onClick={() => onMarcarEntregar(pedido.id, noCobrar)}
          >
            {ocupado ? 'Marcando…' : 'Marcar Entregado'}
          </Button>
        </div>
      )}

      {puedeCobrarPendiente && (
        <Button
          size="lg"
          className="mt-4 w-full"
          disabled={ocupado}
          onClick={() => onCobrar(pedido.id)}
        >
          {ocupado ? 'Cobrando…' : 'Cobrar (venta pendiente)'}
        </Button>
      )}
    </article>
  )
}

function RepartidorHomePage() {
  const { usuario, logout } = useAuth()
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupadoId, setOcupadoId] = useState(null)

  const repartidorId = usuario?.empleado?.id

  const cargar = useCallback(async () => {
    if (repartidorId == null) return
    setError('')
    setPedidos(null)
    try {
      const datos = await obtenerPedidosRepartidor(repartidorId)
      setPedidos(datos)
    } catch (err) {
      setError(err.message)
    }
  }, [repartidorId])

  useEffect(() => {
    cargar()
  }, [cargar])

  const marcarEntregado = async (id, noCobrar) => {
    setError('')
    setMensaje('')
    setOcupadoId(id)
    // Flujo unificado de entrega + pago (docs/07): al entregar un pedido
    // Pendiente_pago y SIN "No cobrar", el repartidor también cobra en el
    // mismo acto (una sola acción cubre entregar y cobrar; ya no depende del
    // Administrador para el segundo paso).
    const pendienteDePago = (pedidos || []).some(
      (p) => p.id === id && p.estadoPago === 'Pendiente_pago',
    )
    try {
      await cambiarEstadoPreparacion(id, { estadoPreparacion: 'Entregado', noCobrar })
      setMensaje(
        noCobrar
          ? 'Pedido entregado y marcado como "No cobrar".'
          : 'Pedido marcado como Entregado.',
      )
      if (!noCobrar && pendienteDePago) {
        try {
          await cambiarEstadoPago(id, { estadoPago: 'Pagado' })
          setMensaje('Pedido entregado y cobrado. Venta generada.')
        } catch (err) {
          setError(err.message)
        }
      }
      await cargar()
    } catch (err) {
      setError(err.message)
      await cargar()
    } finally {
      setOcupadoId(null)
    }
  }

  const cobrarPendiente = async (id) => {
    setError('')
    setMensaje('')
    setOcupadoId(id)
    try {
      await cambiarEstadoPago(id, { estadoPago: 'Pagado' })
      setMensaje('Pedido cobrado. Venta generada.')
      await cargar()
    } catch (err) {
      setError(err.message)
      await cargar()
    } finally {
      setOcupadoId(null)
    }
  }

  if (repartidorId == null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-10">
        <p className="font-medium text-danger">
          No se encontró tu perfil de repartidor. Cierra sesión y vuelve a entrar.
        </p>
        <Button variant="secondary" size="md" onClick={logout}>
          Cerrar sesión
        </Button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-surface pb-16">
      <div className="sticky top-0 z-30 border-b border-muted/10 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="min-w-0 text-2xl font-bold text-ink">Mis pedidos</h1>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={cargar}
              aria-label="Actualizar pedidos"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-ink shadow-card transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            <button
              type="button"
              onClick={logout}
              className="flex h-14 items-center gap-2 rounded-full bg-card px-5 text-sm font-semibold text-danger shadow-card transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-4 px-4 pt-6 sm:px-6 lg:px-8">
        {(error || mensaje) && (
          <div className="space-y-2">
            {error && (
              <p
                role="alert"
                className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger"
              >
                {error}
              </p>
            )}
            {mensaje && (
              <p className="rounded-2xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700">
                {mensaje}
              </p>
            )}
          </div>
        )}

        {pedidos === null ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
            <p className="text-sm">Cargando tus pedidos…</p>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-sm font-medium text-muted">Aún no tienes pedidos asignados.</p>
            <Button variant="secondary" size="md" onClick={cargar}>
              Actualizar
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pedidos.map((pedido) => (
              <TarjetaPedido
                key={pedido.id}
                pedido={pedido}
                ocupado={ocupadoId === pedido.id}
                onMarcarEntregar={marcarEntregado}
                onCobrar={cobrarPendiente}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

export default RepartidorHomePage