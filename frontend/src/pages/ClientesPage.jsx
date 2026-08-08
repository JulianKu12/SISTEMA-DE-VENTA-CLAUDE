import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import ModalHoja from '../components/ui/ModalHoja'
import {
  actualizarCliente,
  actualizarReferencia,
  crearCliente,
  crearReferencia,
  eliminarCliente,
  eliminarReferencia,
  listarClientes,
  obtenerCliente,
} from '../services/clientes'

const CLASE_INPUT =
  'w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

const CONFIG_ESTADO_PEDIDO = {
  Pendiente: { etiqueta: 'Pendiente', fondo: 'bg-amber-500/10', texto: 'text-amber-700' },
  En_preparacion: { etiqueta: 'En preparación', fondo: 'bg-blue-500/10', texto: 'text-blue-700' },
  Enviado: { etiqueta: 'Enviado', fondo: 'bg-purple-500/10', texto: 'text-purple-700' },
  Entregado: { etiqueta: 'Entregado', fondo: 'bg-green-500/10', texto: 'text-green-700' },
  Cancelado: { etiqueta: 'Cancelado', fondo: 'bg-muted/10', texto: 'text-muted' },
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

function IconoCierre() {
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
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function EtiquetaSeccion({ children }) {
  return <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
}

function InsigniaEstado({ estado }) {
  const activo = estado === 'Activo'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        activo ? 'bg-green-500/10 text-green-700' : 'bg-muted/10 text-muted'
      }`}
    >
      {estado}
    </span>
  )
}

function ModalConfirmar({
  titulo,
  mensaje,
  onConfirmar,
  onCancelar,
  confirmarEtiqueta,
  variante,
  children,
}) {
  const colorBoton =
    variante === 'danger'
      ? 'bg-danger text-white shadow-[0_4px_14px_rgb(255_59_48/0.35)] active:bg-danger/85'
      : 'bg-accent text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] active:bg-accent/85'
  return (
    <ModalHoja abierto titulo={titulo} onCerrar={onCancelar}>
      {mensaje && <p className="text-sm leading-relaxed text-muted">{mensaje}</p>}
      {children}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancelar}
          className="inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          className={`inline-flex min-h-12 flex-1 select-none items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-semibold transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${colorBoton}`}
        >
          {confirmarEtiqueta}
        </button>
      </div>
    </ModalHoja>
  )
}

function ModalFormularioCliente({ onCerrar, onGuardar }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Escribe el nombre del cliente')

    setEnviando(true)
    try {
      await onGuardar({
        nombre: nombre.trim(),
        telefono: telefono.trim() || undefined,
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
      titulo="Nuevo cliente"
      subtitulo="Guarda el cliente para reutilizarlo en los pedidos a domicilio."
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        {error && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="cli-nombre">
            Nombre
          </label>
          <input
            id="cli-nombre"
            className={CLASE_INPUT}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. María González"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="cli-telefono">
            Teléfono <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="cli-telefono"
            className={CLASE_INPUT}
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Ej. 614 123 4567"
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

function ClientesPage() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState(null)
  const [errorLista, setErrorLista] = useState('')
  const [notificacion, setNotificacion] = useState('')
  const [modalNuevo, setModalNuevo] = useState(false)
  const [expandidoId, setExpandidoId] = useState(null)
  const [detalles, setDetalles] = useState(new Map())
  const [cargando, setCargando] = useState(false)
  const [ocupado, setOcupado] = useState(null)
  const [nuevaReferencia, setNuevaReferencia] = useState('')
  const [confirmacion, setConfirmacion] = useState(null)

  const cargar = async () => {
    setCargando(true)
    setErrorLista('')
    try {
      const datos = await listarClientes()
      setClientes(datos)
    } catch (err) {
      setErrorLista(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let activo = true
    listarClientes()
      .then((datos) => {
        if (activo) setClientes(datos)
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

  const guardarClienteLocal = (actualizado) => {
    setClientes((cs) => (cs || []).map((c) => (c.id === actualizado.id ? actualizado : c)))
  }

  const abrirDetalle = async (cliente) => {
    if (expandidoId === cliente.id) {
      setExpandidoId(null)
      return
    }
    setExpandidoId(cliente.id)
    setNuevaReferencia('')
    if (detalles.get(cliente.id)) return
    try {
      const detalle = await obtenerCliente(cliente.id)
      setDetalles((ds) => new Map(ds).set(cliente.id, detalle))
    } catch (err) {
      setErrorLista(err.message)
    }
  }

  const agregarReferencia = async (cliente, e) => {
    e.preventDefault()
    if (!nuevaReferencia.trim() || ocupado) return
    setOcupado(`agregar-${cliente.id}`)
    setErrorLista('')
    try {
      const ref = await crearReferencia(cliente.id, nuevaReferencia.trim())
      const detalle = detalles.get(cliente.id)
      const actualizado = {
        ...(detalle || cliente),
        referencias: [...(detalle?.referencias || cliente.referencias || []), ref],
      }
      guardarClienteLocal(actualizado)
      setDetalles((ds) => new Map(ds).set(cliente.id, actualizado))
      setNuevaReferencia('')
      setNotificacion('Referencia agregada')
    } catch (err) {
      setErrorLista(err.message)
    } finally {
      setOcupado(null)
    }
  }

  const desactivarReferencia = async (cliente, ref) => {
    if (ocupado) return
    setOcupado(`toggle-${ref.id}`)
    try {
      const res = await actualizarReferencia(ref.id, {
        estado: ref.estado === 'Activo' ? 'Inactivo' : 'Activo',
      })
      const detalle = detalles.get(cliente.id)
      const actualizado = {
        ...(detalle || cliente),
        referencias: (detalle?.referencias || cliente.referencias || []).map((r) =>
          r.id === ref.id ? res : r,
        ),
      }
      guardarClienteLocal(actualizado)
      setDetalles((ds) => new Map(ds).set(cliente.id, actualizado))
      setNotificacion(res.estado === 'Activo' ? 'Referencia activada' : 'Referencia desactivada')
      setErrorLista('')
    } catch (err) {
      setErrorLista(err.message)
    } finally {
      setOcupado(null)
    }
  }

  const eliminarReferenciaConfirmar = async () => {
    if (!confirmacion) return
    const { cliente, referencia } = confirmacion
    setOcupado(`eliminar-ref-${referencia.id}`)
    try {
      await eliminarReferencia(referencia.id)
      const detalle = detalles.get(cliente.id)
      const actualizado = {
        ...(detalle || cliente),
        referencias: (detalle?.referencias || cliente.referencias || []).filter(
          (r) => r.id !== referencia.id,
        ),
      }
      guardarClienteLocal(actualizado)
      setDetalles((ds) => new Map(ds).set(cliente.id, actualizado))
      setConfirmacion(null)
      setNotificacion('Referencia eliminada')
    } catch (err) {
      setErrorLista(err.message)
      setConfirmacion(null)
    } finally {
      setOcupado(null)
    }
  }

  const confirmarAccionCliente = async () => {
    if (!confirmacion || ocupado) return
    const { cliente, accion } = confirmacion
    setOcupado(`cli-${cliente.id}`)
    try {
      if (accion === 'desactivar' || accion === 'activar') {
        const res = await actualizarCliente(cliente.id, {
          estado: accion === 'desactivar' ? 'Inactivo' : 'Activo',
        })
        guardarClienteLocal(res)
        setDetalles((ds) => {
          const d = ds.get(cliente.id)
          return d ? new Map(ds).set(cliente.id, res) : ds
        })
      } else {
        await eliminarCliente(cliente.id)
        setClientes((cs) => (cs || []).filter((c) => c.id !== cliente.id))
        setDetalles((ds) => new Map([...ds].filter(([id]) => id !== cliente.id)))
        if (expandidoId === cliente.id) setExpandidoId(null)
      }
      setNotificacion(
        accion === 'desactivar'
          ? 'Cliente desactivado'
          : accion === 'activar'
            ? 'Cliente activado'
            : 'Cliente eliminado',
      )
      setConfirmacion(null)
    } catch (err) {
      setErrorLista(err.message)
      setConfirmacion(null)
    } finally {
      setOcupado(null)
    }
  }

  const guardarNuevo = async (payload) => {
    await crearCliente(payload)
    setNotificacion('Cliente creado')
    cargar()
  }

  const cargandoInicial = clientes === null && !errorLista && !cargando

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
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Clientes</h1>
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

        {errorLista && clientes === null && (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center shadow-card">
            <p className="text-sm text-muted">No se pudieron cargar los clientes.</p>
            <Button variant="secondary" size="md" onClick={cargar}>
              Reintentar
            </Button>
          </div>
        )}

        {cargandoInicial && (
          <div className="flex flex-col items-center gap-3 py-24 text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
            <p className="text-sm">Cargando…</p>
          </div>
        )}

        {!cargandoInicial && clientes !== null && (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <EtiquetaSeccion>
                {clientes.length} cliente{clientes.length === 1 ? '' : 's'}
              </EtiquetaSeccion>
              <Button size="md" onClick={() => setModalNuevo(true)}>
                <IconoMas /> Nuevo cliente
              </Button>
            </div>

            {clientes.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">Aún no hay clientes. Crea el primero.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <ul className="divide-y divide-muted/10">
                  {clientes.map((cliente) => {
                    const totalReferencias = (cliente.referencias || []).length
                    const totalPedidos = cliente._count?.pedidos ?? 0
                    const expandido = expandidoId === cliente.id
                    const detalle = detalles.get(cliente.id)
                    const pendienteDetalle = expandido && !detalle
                    return (
                      <li key={cliente.id} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => abrirDetalle(cliente)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-ink">
                                {cliente.nombre}
                              </p>
                              <InsigniaEstado estado={cliente.estado} />
                            </div>
                            <p className="mt-0.5 text-xs text-muted">
                              {cliente.telefono ? (
                                <span className="font-semibold text-ink">{cliente.telefono}</span>
                              ) : (
                                'Sin teléfono'
                              )}{' '}
                              · {totalReferencias} referencia
                              {totalReferencias === 1 ? '' : 's'} · {totalPedidos} pedido
                              {totalPedidos === 1 ? '' : 's'}
                            </p>
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            {cliente.estado === 'Activo' && totalPedidos === 0 && (
                              <button
                                type="button"
                                onClick={() => setConfirmacion({ cliente, accion: 'eliminar' })}
                                className="rounded-full px-3 py-2 text-sm font-semibold text-danger transition active:scale-95"
                              >
                                Eliminar
                              </button>
                            )}
                            {cliente.estado === 'Activo' && totalPedidos > 0 && (
                              <button
                                type="button"
                                onClick={() => setConfirmacion({ cliente, accion: 'desactivar' })}
                                className="rounded-full px-3 py-2 text-sm font-semibold text-amber-600 transition active:scale-95"
                              >
                                Desactivar
                              </button>
                            )}
                            {cliente.estado === 'Inactivo' && (
                              <button
                                type="button"
                                onClick={() => setConfirmacion({ cliente, accion: 'activar' })}
                                className="rounded-full px-3 py-2 text-sm font-semibold text-accent transition active:scale-95"
                              >
                                Activar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => abrirDetalle(cliente)}
                              aria-label={expandido ? 'Ocultar detalle' : 'Ver detalle'}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition active:scale-95"
                            >
                              <IconoCierre
                                {...(expandido ? { className: 'h-3.5 w-3.5 rotate-45' } : {})}
                              />
                            </button>
                          </div>
                        </div>

                        {expandido && (
                          <div className="mt-4 space-y-4 border-t border-muted/10 pt-4">
                            {pendienteDetalle && (
                              <div className="flex items-center gap-2 py-2 text-sm text-muted">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
                                Cargando detalle…
                              </div>
                            )}

                            {(detalle || cliente) && (
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <EtiquetaSeccion>Referencias de entrega</EtiquetaSeccion>
                                  {((detalle || cliente).referencias || []).length === 0 ? (
                                    <p className="text-sm text-muted">
                                      Sin referencias guardadas.
                                    </p>
                                  ) : (
                                    (detalle || cliente).referencias.map((ref) => (
                                      <div
                                        key={ref.id}
                                        className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-sm text-ink">
                                            {ref.descripcion}
                                          </p>
                                          <p className="mt-0.5 text-xs text-muted">
                                            {ref.estado === 'Activo'
                                              ? 'Activa'
                                              : 'Inactiva (no se ofrece al crear pedido)'}
                                          </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                          <button
                                            type="button"
                                            disabled={ocupado === `toggle-${ref.id}`}
                                            onClick={() => desactivarReferencia(cliente, ref)}
                                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-amber-600 transition active:scale-95 disabled:opacity-50"
                                          >
                                            {ocupado === `toggle-${ref.id}`
                                              ? '…'
                                              : ref.estado === 'Activo'
                                                ? 'Desactivar'
                                                : 'Activar'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setConfirmacion({ cliente, referencia: ref })
                                            }
                                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-danger transition active:scale-95"
                                          >
                                            Eliminar
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}

                                  <form
                                    onSubmit={(e) => agregarReferencia(cliente, e)}
                                    className="flex flex-wrap items-end gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <input
                                        className={CLASE_INPUT}
                                        value={nuevaReferencia}
                                        onChange={(e) => setNuevaReferencia(e.target.value)}
                                        placeholder="Nueva referencia (ej. casa azul, frente a la tienda)"
                                      />
                                    </div>
                                    <Button
                                      variant="secondary"
                                      size="md"
                                      type="submit"
                                      disabled={
                                        !nuevaReferencia.trim() || ocupado === `agregar-${cliente.id}`
                                      }
                                    >
                                      {ocupado === `agregar-${cliente.id}` ? '…' : 'Agregar'}
                                    </Button>
                                  </form>
                                </div>

                                <div className="space-y-2">
                                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                                    Historial de pedidos
                                  </h2>
                                  {pendienteDetalle && (
                                    <p className="text-sm text-muted">Cargando pedidos…</p>
                                  )}
                                  {detalle && detalle.pedidos.length === 0 && (
                                    <p className="text-sm text-muted">Sin pedidos registrados.</p>
                                  )}
                                  {detalle && detalle.pedidos.length > 0 && (
                                    <div className="overflow-hidden rounded-2xl bg-surface">
                                      <ul className="divide-y divide-muted/10">
                                        {detalle.pedidos.map((pedido) => {
                                          const cfg =
                                            CONFIG_ESTADO_PEDIDO[pedido.estadoPreparacion] ||
                                            CONFIG_ESTADO_PEDIDO.Cancelado
                                          return (
                                            <li key={pedido.id} className="px-4 py-3">
                                              <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                  <p className="text-sm font-bold text-ink">
                                                    Pedido #{pedido.id}
                                                  </p>
                                                  <p className="mt-0.5 text-xs text-muted">
                                                    {formatearFecha(pedido.fechaHoraCreacion)} ·{' '}
                                                    {pedido.estadoPago === 'Pagado'
                                                      ? 'Pagado'
                                                      : pedido.estadoPago === 'No_cobra'
                                                        ? 'No cobra'
                                                        : 'Pendiente de pago'}
                                                  </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                  <span
                                                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.fondo} ${cfg.texto}`}
                                                  >
                                                    {cfg.etiqueta}
                                                  </span>
                                                  <span className="text-sm font-bold text-ink">
                                                    {formatearMonto(pedido.total)}
                                                  </span>
                                                </div>
                                              </div>
                                            </li>
                                          )
                                        })}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {modalNuevo && (
        <ModalFormularioCliente onCerrar={() => setModalNuevo(false)} onGuardar={guardarNuevo} />
      )}

      {confirmacion && confirmacion.referencia && (
        <ModalConfirmar
          titulo={`¿Eliminar referencia "${confirmacion.referencia.descripcion}"?`}
          mensaje="Solo se elimina si ninguna pedido la usa todavía. Si tiene pedidos asociados, el sistema te indicará que la desactives."
          confirmarEtiqueta="Eliminar"
          variante="danger"
          onCancelar={() => setConfirmacion(null)}
          onConfirmar={eliminarReferenciaConfirmar}
        />
      )}

      {confirmacion && confirmacion.accion === 'eliminar' && (
        <ModalConfirmar
          titulo={`¿Eliminar a "${confirmacion.cliente.nombre}"?`}
          mensaje="Esta acción no se puede deshacer. Solo se permite cuando el cliente no tiene pedidos asociados."
          confirmarEtiqueta="Eliminar"
          variante="danger"
          onCancelar={() => setConfirmacion(null)}
          onConfirmar={confirmarAccionCliente}
        />
      )}

      {confirmacion && confirmacion.accion === 'desactivar' && (
        <ModalConfirmar
          titulo={`¿Desactivar a "${confirmacion.cliente.nombre}"?`}
          mensaje="Se conserva su historial de pedidos, pero ya no podrá buscarse al crear un nuevo pedido."
          confirmarEtiqueta="Desactivar"
          onCancelar={() => setConfirmacion(null)}
          onConfirmar={confirmarAccionCliente}
        />
      )}

      {confirmacion && confirmacion.accion === 'activar' && (
        <ModalConfirmar
          titulo={`¿Reactivar a "${confirmacion.cliente.nombre}"?`}
          mensaje="Volverá a aparecer al buscar clientes al crear un pedido."
          confirmarEtiqueta="Activar"
          onCancelar={() => setConfirmacion(null)}
          onConfirmar={confirmarAccionCliente}
        />
      )}
    </main>
  )
}

export default ClientesPage