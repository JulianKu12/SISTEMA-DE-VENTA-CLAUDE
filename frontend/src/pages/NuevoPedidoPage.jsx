import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { obtenerCombos, obtenerProductos } from '../services/catalogo'

const TIPOS_PEDIDO = [
  { id: 'Para_recoger', etiqueta: 'Para recoger' },
  { id: 'A_domicilio', etiqueta: 'A domicilio' },
]

const CARD_ACCION = 'shadow-card transition duration-150 ease-out active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

function formatearMonto(monto) {
  return monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
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

function IconoChevron({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 transition ${className}`}
      aria-hidden="true"
    >
      <path d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

function IconoEquis({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${className}`}
      aria-hidden="true"
    >
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function EtiquetaSeccion({ children }) {
  return (
    <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{children}</h2>
  )
}

function FilaModificador({ marcado, onToggle, etiqueta, costo, tono }) {
  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-3 rounded-2xl px-4 py-3 transition ${
        marcado ? (tono === 'quitar' ? 'bg-danger/10' : 'bg-accent/10') : 'bg-surface'
      }`}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={onToggle}
        className="h-5 w-5 shrink-0 accent-accent"
      />
      <span className="min-w-0 flex-1 text-sm font-medium text-ink">{etiqueta}</span>
      {costo > 0 && (
        <span className="shrink-0 text-sm font-semibold text-accent">+{formatearMonto(costo)}</span>
      )}
    </label>
  )
}

function ModalProducto({ producto, productosMitad, onCancelar, onAgregar }) {
  const [modo, setModo] = useState('completo')
  const [sabor1, setSabor1] = useState(producto.id)
  const [sabor2, setSabor2] = useState(null)
  const [seleccion, setSeleccion] = useState({})
  const [nota, setNota] = useState('')

  const modificadores = useMemo(
    () =>
      (producto.productoModificadores || [])
        .map((pm) => pm.modificador)
        .filter((m) => m && m.estado === 'Activo'),
    [producto],
  )

  const grupos = useMemo(
    () => ({
      quitar: modificadores.filter((m) => m.tipo === 'Quitar'),
      agregar: modificadores.filter((m) => m.tipo === 'Agregar'),
      sustituir: modificadores.filter((m) => m.tipo === 'Sustituir'),
    }),
    [modificadores],
  )

  const costoExtra = modificadores
    .filter((m) => seleccion[m.id])
    .reduce((acc, m) => acc + (m.costoAdicional || 0), 0)
  const precioTotal = producto.precio + costoExtra

  const mitadyMitadValido = modo === 'completo' || (sabor1 && sabor2)

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

  const toggleMod = (id) => {
    setSeleccion((s) => ({ ...s, [id]: !s[id] }))
  }

  const confirmar = () => {
    onAgregar({
      productoId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      esMitadYMitad: modo === 'mitad',
      sabor1: modo === 'mitad' ? productosMitad.find((p) => p.id === sabor1) || null : null,
      sabor2: modo === 'mitad' ? productosMitad.find((p) => p.id === sabor2) || null : null,
      modificadores: modificadores.filter((m) => seleccion[m.id]),
      nota: nota.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative max-h-[88vh] w-full max-w-lg animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card shadow-card">
        <div className="sticky top-0 z-10 rounded-t-3xl bg-card px-6 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">{producto.nombre}</h2>
              <p className="text-sm text-muted">{formatearMonto(producto.precio)}</p>
            </div>
            <button
              type="button"
              onClick={onCancelar}
              aria-label="Cerrar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition active:scale-95"
            >
              <IconoEquis />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 pb-6">
          {producto.permiteMitadYMitad && (
            <section>
              <EtiquetaSeccion>Tamaño</EtiquetaSeccion>
              <div className="grid grid-cols-2 gap-1 rounded-full bg-input p-1">
                {[
                  { id: 'completo', etiqueta: 'Sabor completo' },
                  { id: 'mitad', etiqueta: 'Mitad y mitad' },
                ].map((opcion) => {
                  const activo = modo === opcion.id
                  return (
                    <button
                      key={opcion.id}
                      type="button"
                      onClick={() => setModo(opcion.id)}
                      aria-pressed={activo}
                      className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                        activo
                          ? 'bg-card text-accent shadow-card'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      {opcion.etiqueta}
                    </button>
                  )
                })}
              </div>

              {modo === 'mitad' && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-muted">Sabor 1</span>
                    <select
                      value={sabor1 ?? ''}
                      onChange={(e) => setSabor1(Number(e.target.value))}
                      className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
                    >
                      <option value="" disabled>
                        Elige un sabor
                      </option>
                      {productosMitad.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-muted">Sabor 2</span>
                    <select
                      value={sabor2 ?? ''}
                      onChange={(e) => setSabor2(Number(e.target.value))}
                      className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition focus:ring-2 focus:ring-accent/40"
                    >
                      <option value="" disabled>
                        Elige un sabor
                      </option>
                      {productosMitad.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </section>
          )}

          {grupos.quitar.length > 0 && (
            <section>
              <EtiquetaSeccion>Quitar</EtiquetaSeccion>
              <div className="space-y-2">
                {grupos.quitar.map((m) => (
                  <FilaModificador
                    key={m.id}
                    marcado={!!seleccion[m.id]}
                    onToggle={() => toggleMod(m.id)}
                    etiqueta={m.nombre}
                    costo={m.costoAdicional || 0}
                    tono="quitar"
                  />
                ))}
              </div>
            </section>
          )}

          {grupos.agregar.length > 0 && (
            <section>
              <EtiquetaSeccion>Agregar</EtiquetaSeccion>
              <div className="space-y-2">
                {grupos.agregar.map((m) => (
                  <FilaModificador
                    key={m.id}
                    marcado={!!seleccion[m.id]}
                    onToggle={() => toggleMod(m.id)}
                    etiqueta={m.nombre}
                    costo={m.costoAdicional || 0}
                    tono="agregar"
                  />
                ))}
              </div>
            </section>
          )}

          {grupos.sustituir.length > 0 && (
            <section>
              <EtiquetaSeccion>Sustituir</EtiquetaSeccion>
              <div className="space-y-2">
                {grupos.sustituir.map((m) => {
                  const afectado = m.ingredienteAfectado?.nombre || 'el ingrediente'
                  const sustituto = m.ingredienteSustituto?.nombre || ''
                  return (
                    <FilaModificador
                      key={m.id}
                      marcado={!!seleccion[m.id]}
                      onToggle={() => toggleMod(m.id)}
                      etiqueta={`Sustituir ${afectado} por ${sustituto}`.trim()}
                      costo={m.costoAdicional || 0}
                      tono="sustituir"
                    />
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <EtiquetaSeccion>Nota</EtiquetaSeccion>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. bien cocido, sin salsa extra…"
              rows={2}
              className="w-full resize-none rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
            />
          </section>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={!mitadyMitadValido}
              onClick={confirmar}
            >
              Agregar · {formatearMonto(precioTotal)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NuevoPedidoPage() {
  const navigate = useNavigate()
  const [tipo, setTipo] = useState(null)
  const [productos, setProductos] = useState(null)
  const [combos, setCombos] = useState(null)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState([])
  const [modalProducto, setModalProducto] = useState(null)
  const [ticketAbierto, setTicketAbierto] = useState(true)

  const cargarCatalogo = useCallback(async () => {
    setError('')
    setProductos(null)
    setCombos(null)
    try {
      const [datosProductos, datosCombos] = await Promise.all([
        obtenerProductos(),
        obtenerCombos(),
      ])
      setProductos(datosProductos)
      setCombos(datosCombos.filter((c) => c.estado === 'Activo'))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    cargarCatalogo()
  }, [cargarCatalogo])

  const productosMitad = useMemo(
    () => (productos || []).filter((p) => p.permiteMitadYMitad),
    [productos],
  )

  const tieneConfiguracion = (producto) =>
    producto.permiteMitadYMitad ||
    (producto.productoModificadores || []).some((pm) => pm.modificador?.estado === 'Activo')

  const agregarLinea = (linea) => {
    setTicket((t) => [...t, linea])
  }

  const seleccionarProducto = (producto) => {
    if (tieneConfiguracion(producto)) {
      setModalProducto(producto)
      return
    }
    agregarLinea({
      key: crypto.randomUUID(),
      tipoLinea: 'producto',
      productoId: producto.id,
      nombre: producto.nombre,
      esMitadYMitad: false,
      sabor1: null,
      sabor2: null,
      modificadores: [],
      nota: '',
      precioUnitario: producto.precio,
      cantidad: 1,
    })
  }

  const seleccionarCombo = (combo) => {
    agregarLinea({
      key: crypto.randomUUID(),
      tipoLinea: 'combo',
      comboId: combo.id,
      nombre: combo.nombre,
      esMitadYMitad: false,
      sabor1: null,
      sabor2: null,
      modificadores: [],
      nota: '',
      precioUnitario: combo.precioEspecial,
      cantidad: 1,
    })
  }

  const manejarAgregarModal = (config) => {
    setTicket((t) => [
      ...t,
      {
        key: crypto.randomUUID(),
        tipoLinea: 'producto',
        productoId: config.productoId,
        nombre: config.nombre,
        esMitadYMitad: config.esMitadYMitad,
        sabor1: config.sabor1,
        sabor2: config.sabor2,
        modificadores: config.modificadores.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          tipo: m.tipo,
          costoAdicional: m.costoAdicional || 0,
        })),
        nota: config.nota,
        precioUnitario: config.precio,
        cantidad: 1,
      },
    ])
    setModalProducto(null)
  }

  const cambiarCantidad = (key, delta) => {
    setTicket((t) =>
      t.map((item) =>
        item.key === key ? { ...item, cantidad: Math.max(1, item.cantidad + delta) } : item,
      ),
    )
  }

  const quitarLinea = (key) => {
    setTicket((t) => t.filter((item) => item.key !== key))
  }

  const subtotalDe = (item) => {
    const costoMods = item.modificadores.reduce((acc, m) => acc + (m.costoAdicional || 0), 0)
    return (item.precioUnitario + costoMods) * item.cantidad
  }

  const total = useMemo(() => ticket.reduce((acc, item) => acc + subtotalDe(item), 0), [ticket])

  const confirmarPedido = () => {
    console.log({ tipo, productos: ticket })
  }

  const cargando = productos === null && !error

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
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Nuevo Pedido</h1>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="mt-6">
          <EtiquetaSeccion>Tipo de pedido</EtiquetaSeccion>
          <div className="rounded-3xl bg-card p-2 shadow-card">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-input p-1">
              {TIPOS_PEDIDO.map((t) => {
                const activo = tipo === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipo(t.id)}
                    aria-pressed={activo}
                    className={`rounded-full px-3 py-4 text-base font-semibold transition ${
                      activo
                        ? 'bg-card text-accent shadow-card'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {t.etiqueta}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {!tipo && (
          <div className="mt-6 rounded-3xl bg-card px-6 py-10 text-center shadow-card">
            <p className="text-base font-medium text-muted">
              Selecciona el tipo de pedido para continuar
            </p>
          </div>
        )}

        <div
          className={`mt-6 lg:flex lg:items-start lg:gap-6 ${
            tipo ? '' : 'pointer-events-none select-none opacity-40'
          }`}
        >
          <div className="min-w-0 flex-1">
            {error ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                <p className="font-medium text-danger">{error}</p>
                <Button variant="secondary" size="md" onClick={cargarCatalogo}>
                  Reintentar
                </Button>
              </div>
            ) : cargando ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
                <p className="text-sm">Cargando productos…</p>
              </div>
            ) : (
              <>
                {combos.length > 0 && (
                  <section className="mb-8">
                    <EtiquetaSeccion>Combos</EtiquetaSeccion>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                      {combos.map((combo) => (
                        <button
                          key={combo.id}
                          type="button"
                          onClick={() => seleccionarCombo(combo)}
                          className={`flex min-h-24 flex-col items-start justify-between gap-2 rounded-3xl bg-card p-4 text-left ${CARD_ACCION}`}
                        >
                          <span className="text-sm font-semibold leading-snug text-ink">
                            Combo · {combo.nombre}
                          </span>
                          <span className="text-base font-bold text-accent">
                            {formatearMonto(combo.precioEspecial)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section>
                  <EtiquetaSeccion>Productos</EtiquetaSeccion>
                  {productos.length === 0 ? (
                    <p className="rounded-3xl bg-card px-6 py-10 text-center text-sm text-muted shadow-card">
                      No hay productos disponibles hoy
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                      {productos.map((producto) => (
                        <button
                          key={producto.id}
                          type="button"
                          onClick={() => seleccionarProducto(producto)}
                          className={`flex min-h-24 flex-col items-start justify-between gap-2 rounded-3xl bg-card p-4 text-left ${CARD_ACCION}`}
                        >
                          <span className="text-sm font-semibold leading-snug text-ink">
                            {producto.nombre}
                          </span>
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="text-base font-bold text-accent">
                              {formatearMonto(producto.precio)}
                            </span>
                            {tieneConfiguracion(producto) && (
                              <span className="rounded-full bg-muted/10 px-2 py-0.5 text-[11px] font-semibold text-muted">
                                Opciones
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

          <aside className="mt-6 lg:mt-0 lg:w-96 lg:shrink-0 xl:w-[26rem]">
            <div className="rounded-3xl bg-card shadow-card lg:sticky lg:top-24">
              <header className="flex items-center justify-between border-b border-muted/10 px-5 py-4">
                <h2 className="text-base font-bold text-ink">Ticket</h2>
                <button
                  type="button"
                  onClick={() => setTicketAbierto((v) => !v)}
                  aria-expanded={ticketAbierto}
                  aria-label={ticketAbierto ? 'Ocultar ticket' : 'Mostrar ticket'}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted transition active:scale-95"
                >
                  <IconoChevron className={ticketAbierto ? 'rotate-180' : ''} />
                </button>
              </header>

              {ticketAbierto && (
                <>
                  {ticket.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted">
                      Aún no agregas productos
                    </p>
                  ) : (
                    <ul className="max-h-96 space-y-2 overflow-y-auto px-4 py-4">
                      {ticket.map((item) => (
                        <li key={item.key} className="rounded-2xl bg-surface p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-ink">
                                {item.nombre}
                              </p>
                              {item.esMitadYMitad && item.sabor1 && item.sabor2 && (
                                <p className="text-xs text-muted">
                                  Mitad: {item.sabor1.nombre} + {item.sabor2.nombre}
                                </p>
                              )}
                              {item.modificadores.length > 0 && (
                                <p className="text-xs text-muted">
                                  {item.modificadores.map((m) => m.nombre).join(', ')}
                                </p>
                              )}
                              {item.nota && (
                                <p className="text-xs italic text-muted">Nota: {item.nota}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => quitarLinea(item.key)}
                              aria-label={`Quitar ${item.nombre}`}
                              className="shrink-0 rounded-full p-1.5 text-muted transition hover:text-danger active:scale-90"
                            >
                              <IconoEquis className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => cambiarCantidad(item.key, -1)}
                                disabled={item.cantidad <= 1}
                                aria-label="Disminuir cantidad"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-ink shadow-card transition active:scale-95 disabled:opacity-40"
                              >
                                -
                              </button>
                              <span className="w-8 text-center text-sm font-semibold text-ink">
                                {item.cantidad}
                              </span>
                              <button
                                type="button"
                                onClick={() => cambiarCantidad(item.key, 1)}
                                aria-label="Aumentar cantidad"
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-ink shadow-card transition active:scale-95"
                              >
                                +
                              </button>
                            </div>
                            <p className="text-sm font-bold text-ink">
                              {formatearMonto(subtotalDe(item))}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <footer className="border-t border-muted/10 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted">Total</span>
                      <span className="text-xl font-bold text-ink">{formatearMonto(total)}</span>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      disabled={ticket.length === 0}
                      onClick={confirmarPedido}
                    >
                      Confirmar pedido
                    </Button>
                  </footer>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>

      {modalProducto && (
        <ModalProducto
          key={modalProducto.id}
          producto={modalProducto}
          productosMitad={productosMitad}
          onCancelar={() => setModalProducto(null)}
          onAgregar={manejarAgregarModal}
        />
      )}
    </main>
  )
}

export default NuevoPedidoPage
