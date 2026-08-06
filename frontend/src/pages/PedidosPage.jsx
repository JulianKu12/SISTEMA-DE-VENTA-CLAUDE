import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useAuth } from '../context/useAuth'
import { obtenerPedidos } from '../services/pedidos'

const FILTROS = [
  { id: 'Todos', etiqueta: 'Todos' },
  { id: 'Pendiente', etiqueta: 'Pendientes' },
  { id: 'En_preparacion', etiqueta: 'En preparación' },
  { id: 'Enviado', etiqueta: 'Enviado' },
  { id: 'Entregado', etiqueta: 'Entregado' },
  { id: 'Cancelado', etiqueta: 'Cancelado' },
]

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

const ETIQUETAS_SECCION = {
  Pendiente: 'Pendientes',
  En_preparacion: 'En preparación',
  Enviado: 'Enviados',
  Entregado: 'Entregados',
  Cancelado: 'Cancelados',
}

const BLOQUES_TODOS = ['Pendiente', 'En_preparacion', 'Enviado', 'Entregado']

const OPCIONES_MENU = [
  { etiqueta: 'Configuración de menú', ruta: '/configuracion', icono: 'configuracion' },
  { etiqueta: 'Inventario', ruta: '/inventario', icono: 'inventario' },
  { etiqueta: 'Clientes', ruta: '/clientes', icono: 'clientes' },
  { etiqueta: 'Repartidores', ruta: '/repartidores', icono: 'repartidores' },
  { etiqueta: 'Caja', ruta: '/caja', icono: 'caja' },
  { etiqueta: 'Gastos', ruta: '/gastos', icono: 'gastos' },
  { etiqueta: 'Reportes', ruta: '/reportes', icono: 'reportes' },
]

const PATHS_ICONOS = {
  configuracion:
    'M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  inventario:
    'M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z',
  clientes:
    'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  repartidores:
    'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
  caja: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
  gastos:
    'M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3',
  reportes:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
}

function IconoMenu({ icono }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0 text-muted"
      aria-hidden="true"
    >
      <path d={PATHS_ICONOS[icono]} />
    </svg>
  )
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatearTotal(total) {
  return total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function TarjetaPedido({ pedido, onAbierto }) {
  const estado = CONFIG_ESTADOS[pedido.estadoPreparacion] || CONFIG_ESTADOS.Cancelado
  const nombreCliente = pedido.cliente?.nombre || pedido.nombreClienteLibre || 'Sin nombre'
  const tipo = pedido.tipo === 'A_domicilio' ? 'A domicilio' : 'Para recoger'

  return (
    <button
      type="button"
      onClick={onAbierto}
      className="flex flex-col gap-3 rounded-3xl bg-card p-5 text-left shadow-card transition duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Pedido #{pedido.id}</p>
          <p className="text-xs text-muted">{formatTime(pedido.fechaHoraCreacion)} h</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${estado.fondo} ${estado.texto}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${estado.punto}`} />
          {estado.etiqueta}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-ink">{nombreCliente}</p>
        <p className="text-sm text-muted">{tipo}</p>
      </div>
      <p className="text-lg font-bold text-ink">{formatearTotal(pedido.total)}</p>
    </button>
  )
}

function PedidosPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [filtro, setFiltro] = useState('Todos')
  const [pedidos, setPedidos] = useState(null)
  const [error, setError] = useState('')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const refMenu = useRef(null)

  const cargar = useCallback(async () => {
    setError('')
    setPedidos(null)
    try {
      const datos = await obtenerPedidos()
      setPedidos(datos)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  useEffect(() => {
    if (!menuAbierto) return
    const cerrarMenu = (e) => {
      if (refMenu.current && !refMenu.current.contains(e.target)) setMenuAbierto(false)
    }
    document.addEventListener('mousedown', cerrarMenu)
    return () => document.removeEventListener('mousedown', cerrarMenu)
  }, [menuAbierto])

  const pedidosPorEstado = useMemo(() => {
    const grupos = {}
    for (const p of pedidos || []) {
      ;(grupos[p.estadoPreparacion] ||= []).push(p)
    }
    for (const clave of Object.keys(grupos)) {
      grupos[clave].sort(
        (a, b) => new Date(a.fechaHoraCreacion) - new Date(b.fechaHoraCreacion),
      )
    }
    return grupos
  }, [pedidos])

  const bloquesVisibles = filtro === 'Todos' ? BLOQUES_TODOS : [filtro]

  const ir = (ruta) => navigate(ruta)

  return (
    <main className="min-h-screen bg-surface pb-16">
      <div className="sticky top-0 z-30 border-b border-muted/10 bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="min-w-0 truncate text-2xl font-bold text-ink">Pedidos de hoy</h1>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="lg"
              className="whitespace-nowrap"
              onClick={() => ir('/pedidos/nuevo')}
            >
              + Nuevo Pedido
            </Button>
            <div className="relative" ref={refMenu}>
              <button
                type="button"
                onClick={() => setMenuAbierto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuAbierto}
                aria-label="Menú de opciones"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-card text-ink shadow-card transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                </svg>
              </button>

              {menuAbierto && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-3xl border border-muted/10 bg-card py-2 shadow-card"
                >
                  {OPCIONES_MENU.map((opcion) => (
                    <button
                      key={opcion.ruta}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuAbierto(false)
                        ir(opcion.ruta)
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-muted/10 active:bg-muted/15"
                    >
                      <IconoMenu icono={opcion.icono} />
                      {opcion.etiqueta}
                    </button>
                  ))}
                  <div className="my-2 h-px bg-muted/10" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-danger transition hover:bg-muted/10 active:bg-muted/15"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                    </svg>
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8">
          <div className="flex gap-2">
            {FILTROS.map((f) => {
              const activo = filtro === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  aria-pressed={activo}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activo
                      ? 'bg-accent text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)]'
                      : 'bg-card text-ink/70 shadow-card hover:bg-muted/10'
                  }`}
                >
                  {f.etiqueta}
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      <div className="mx-auto max-w-7xl space-y-10 px-4 pt-8 sm:px-6 lg:px-8">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="font-medium text-danger">{error}</p>
            <Button variant="secondary" size="md" onClick={cargar}>
              Reintentar
            </Button>
          </div>
        ) : pedidos === null ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
            <p className="text-sm">Cargando pedidos…</p>
          </div>
        ) : (
          bloquesVisibles.map((estado) => {
            const pedidosDelBloque = pedidosPorEstado[estado] || []
            return (
              <section key={estado} aria-label={ETIQUETAS_SECCION[estado]}>
                <div className="mb-4 flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${CONFIG_ESTADOS[estado].punto}`}
                  />
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                    {ETIQUETAS_SECCION[estado]}
                  </h2>
                  <span className="rounded-full bg-muted/10 px-2 py-0.5 text-xs font-semibold text-muted">
                    {pedidosDelBloque.length}
                  </span>
                </div>

                {pedidosDelBloque.length === 0 ? (
                  <p className="rounded-3xl bg-card px-6 py-8 text-center text-sm text-muted shadow-card">
                    No hay pedidos en este estado
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {pedidosDelBloque.map((pedido) => (
                      <TarjetaPedido
                        key={pedido.id}
                        pedido={pedido}
                        onAbierto={() => ir(`/pedidos/${pedido.id}`)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })
        )}
      </div>
    </main>
  )
}

export default PedidosPage
