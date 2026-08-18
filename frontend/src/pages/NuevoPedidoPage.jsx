import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import { obtenerCombos, obtenerProductos } from '../services/catalogo'
import { crearPedido } from '../services/pedidos'
import { crearCliente, crearReferencia, listarClientes } from '../services/clientes'
import { useConfiguracion } from '../context/useConfiguracion'
import { agregarLinea } from '../utils/ticket'
import BannerToaster from '../components/ui/BannerToaster'

const TIPOS_PEDIDO = [
  { id: 'Para_recoger', etiqueta: 'Para recoger' },
  { id: 'A_domicilio', etiqueta: 'A domicilio' },
]

const ORIGENES_PEDIDO = [
  { id: 'Mostrador', etiqueta: 'En mostrador' },
  { id: 'Telefono', etiqueta: 'Por teléfono' },
]

const METODOS_PAGO = {
  Para_recoger: ['Efectivo', 'Tarjeta', 'Transferencia'],
  A_domicilio: ['Efectivo', 'Transferencia'],
}

const OPCIONES_CAMBIO_DEFECTO = [50, 100, 200, 500]

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

function IconoCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
      aria-hidden="true"
    >
      <path d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function IconoAlerta() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
      aria-hidden="true"
    >
      <path d="M12 8.5v5" />
      <path d="M12 16.5h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
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

export function ModalProducto({ producto, productosMitad, onCancelar, onAgregar }) {
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

  // Precio de un producto mitad y mitad: suma de la mitad del precio de cada
  // sabor, redondeada al peso entero más cercano. El precio fijo del producto
  // "base" (permiteMitadYMitad=true) NUNCA aplica en este modo.
  const saborObj1 = sabor1 != null ? productosMitad.find((p) => p.id === sabor1) : null
  const saborObj2 = sabor2 != null ? productosMitad.find((p) => p.id === sabor2) : null
  const precioMitadCalculado =
    modo === 'mitad' && saborObj1 && saborObj2
      ? Math.round((saborObj1.precio + saborObj2.precio) / 2)
      : null

  const precioBase = modo === 'mitad' ? precioMitadCalculado ?? producto.precio : producto.precio
  const precioTotal = precioBase + costoExtra

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
      precio: modo === 'mitad' ? (precioMitadCalculado ?? producto.precio) : producto.precio,
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
              <p className="text-sm text-muted">
                {modo === 'mitad' && precioMitadCalculado != null
                  ? `${formatearMonto(saborObj1.precio)} + ${formatearMonto(saborObj2.precio)} → ${formatearMonto(precioMitadCalculado)}`
                  : formatearMonto(producto.precio)}
              </p>
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
              {modo === 'mitad' && (
                <p className="mt-3 rounded-2xl bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent">
                  {precioMitadCalculado != null
                    ? `${saborObj1.nombre} ${formatearMonto(saborObj1.precio)} + ${saborObj2.nombre} ${formatearMonto(saborObj2.precio)} → mitad de cada uno = ${formatearMonto((saborObj1.precio + saborObj2.precio) / 2)}, redondeado a ${formatearMonto(precioMitadCalculado)}`
                    : 'Elige los 2 sabores para calcular el precio.'}
                </p>
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
                {grupos.sustituir.map((m) => (
                  <FilaModificador
                    key={m.id}
                    marcado={!!seleccion[m.id]}
                    onToggle={() => toggleMod(m.id)}
                    etiqueta={m.nombre}
                    costo={m.costoAdicional || 0}
                    tono="sustituir"
                  />
                ))}
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

export function ModalCombo({ combo, onCancelar, onAgregar }) {
  const [seleccion, setSeleccion] = useState({})
  const [notas, setNotas] = useState({})
  const [notaCombo, setNotaCombo] = useState('')

  const productosDelCombo = (combo.productos || []).filter((cp) => cp.producto)

  const modificadoresDe = (producto) =>
    (producto.productoModificadores || [])
      .map((pm) => pm.modificador)
      .filter((m) => m && m.estado === 'Activo')

  // Precio del combo: base fija (precioEspecial) + costo_adicional de cada
  // modificador tipo "Agregar" seleccionado en cualquiera de sus productos
  // incluidos. Quitar y Sustituir no cambian el precio.
  const recargoAgregar = productosDelCombo.reduce(
    (acc, cp) =>
      acc +
      modificadoresDe(cp.producto)
        .filter((m) => seleccion[cp.producto.id]?.[m.id] && m.tipo === 'Agregar')
        .reduce((s, m) => s + (m.costoAdicional || 0), 0),
    0,
  )
  const precioCombo = combo.precioEspecial + recargoAgregar

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

  const toggleMod = (productoId, modId) => {
    setSeleccion((s) => ({ ...s, [productoId]: { ...(s[productoId] || {}), [modId]: !s[productoId]?.[modId] } }))
  }

  const confirmar = () => {
    onAgregar({
      key: crypto.randomUUID(),
      tipoLinea: 'combo',
      comboId: combo.id,
      nombre: combo.nombre,
      esMitadYMitad: false,
      sabor1: null,
      sabor2: null,
      modificadores: [],
      nota: notaCombo.trim(),
      productos: productosDelCombo.map((cp) => ({
        productoId: cp.producto.id,
        nombre: cp.producto.nombre,
        modificadores: modificadoresDe(cp.producto).filter((m) => seleccion[cp.producto.id]?.[m.id]),
        nota: notas[cp.producto.id]?.trim() || '',
      })),
      precioUnitario: combo.precioEspecial,
      cantidad: 1,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
        onClick={onCancelar}
      />
      <div className="relative max-h-[88vh] w-full max-w-2xl animate-[sheet-up_280ms_ease-out] overflow-y-auto rounded-t-3xl bg-card shadow-card">
        <div className="sticky top-0 z-10 rounded-t-3xl bg-card px-6 pb-4 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-muted/30" />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-ink">Combo · {combo.nombre}</h2>
              <p className="text-sm text-muted">
                {productosDelCombo.length} producto{productosDelCombo.length === 1 ? '' : 's'} incluido
                {productosDelCombo.length === 1 ? '' : 's'} · {formatearMonto(combo.precioEspecial)}
              </p>
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
          {productosDelCombo.map((cp) => {
            const producto = cp.producto
            const modificadores = modificadoresDe(producto)
            const grupos = {
              quitar: modificadores.filter((m) => m.tipo === 'Quitar'),
              agregar: modificadores.filter((m) => m.tipo === 'Agregar'),
              sustituir: modificadores.filter((m) => m.tipo === 'Sustituir'),
            }
            const tieneConfig =
              producto.tipo === 'Con_receta' ||
              (producto.productoModificadores || []).some(
                (pm) => pm.modificador?.estado === 'Activo',
              )
            return (
              <section key={producto.id} className="rounded-2xl bg-surface p-4">
                <p className="text-sm font-bold text-ink">
                  {producto.nombre}
                  {cp.cantidad > 1 ? ` ×${cp.cantidad}` : ''}
                </p>

                {grupos.quitar.length > 0 && (
                  <div className="mt-3">
                    <EtiquetaSeccion>Quitar</EtiquetaSeccion>
                    <div className="space-y-2">
                      {grupos.quitar.map((m) => (
                        <FilaModificador
                          key={m.id}
                          marcado={!!seleccion[producto.id]?.[m.id]}
                          onToggle={() => toggleMod(producto.id, m.id)}
                          etiqueta={m.nombre}
                          costo={m.costoAdicional || 0}
                          tono="quitar"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grupos.agregar.length > 0 && (
                  <div className="mt-3">
                    <EtiquetaSeccion>Agregar</EtiquetaSeccion>
                    <div className="space-y-2">
                      {grupos.agregar.map((m) => (
                        <FilaModificador
                          key={m.id}
                          marcado={!!seleccion[producto.id]?.[m.id]}
                          onToggle={() => toggleMod(producto.id, m.id)}
                          etiqueta={m.nombre}
                          costo={m.costoAdicional || 0}
                          tono="agregar"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {grupos.sustituir.length > 0 && (
                  <div className="mt-3">
                    <EtiquetaSeccion>Sustituir</EtiquetaSeccion>
                    <div className="space-y-2">
                      {grupos.sustituir.map((m) => (
                        <FilaModificador
                          key={m.id}
                          marcado={!!seleccion[producto.id]?.[m.id]}
                          onToggle={() => toggleMod(producto.id, m.id)}
                          etiqueta={m.nombre}
                          costo={m.costoAdicional || 0}
                          tono="sustituir"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {tieneConfig && (
                  <div className="mt-3">
                    <EtiquetaSeccion>Nota del producto</EtiquetaSeccion>
                    <textarea
                      value={notas[producto.id] || ''}
                      onChange={(e) => setNotas((n) => ({ ...n, [producto.id]: e.target.value }))}
                      placeholder={`Nota para ${producto.nombre}…`}
                      rows={2}
                      className="w-full resize-none rounded-2xl border-none bg-card px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                )}
              </section>
            )
          })}

          <section>
            <EtiquetaSeccion>Nota del combo</EtiquetaSeccion>
            <textarea
              value={notaCombo}
              onChange={(e) => setNotaCombo(e.target.value)}
              placeholder="Ej. el cliente quiere el combo bien envuelto…"
              rows={2}
              className="w-full resize-none rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
            />
          </section>

          <p className="rounded-2xl bg-muted/5 px-4 py-3 text-xs text-muted">
            El precio del combo es cerrado ({formatearMonto(combo.precioEspecial)}): los
            modificadores Quitar y Sustituir no cambian el precio, pero cada
            modificador Agregar suma su costo extra.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="secondary" size="md" className="flex-1" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button size="md" className="flex-1" onClick={confirmar}>
              Agregar · {formatearMonto(precioCombo)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NuevoPedidoPage() {
  const navigate = useNavigate()
  const { config } = useConfiguracion()
  const costoEnvio = config?.costoEnvio ?? 0
  const opcionesCambio =
    Array.isArray(config?.opcionesCambio) && config.opcionesCambio.length > 0
      ? config.opcionesCambio
      : OPCIONES_CAMBIO_DEFECTO
  const [tipo, setTipo] = useState(null)
  const [origen, setOrigen] = useState('Mostrador')
  const [productos, setProductos] = useState(null)
  const [combos, setCombos] = useState(null)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState([])
  const [modalProducto, setModalProducto] = useState(null)
  const [modalCombo, setModalCombo] = useState(null)
  const [ticketAbierto, setTicketAbierto] = useState(true)
  const [clientes, setClientes] = useState(null)
  const [modoCliente, setModoCliente] = useState('libre')
  const [cliente, setCliente] = useState(null)
  const [clienteBusqueda, setClienteBusqueda] = useState('')
  const [nombreClienteLibre, setNombreClienteLibre] = useState('')
  const [referenciaLibre, setReferenciaLibre] = useState('')
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '' })
  const [referenciaId, setReferenciaId] = useState(null)
  const [mostrarNuevaReferencia, setMostrarNuevaReferencia] = useState(false)
  const [nuevaReferencia, setNuevaReferencia] = useState('')
  const [noCobrar, setNoCobrar] = useState(false)
  const [metodoPago, setMetodoPago] = useState('Efectivo')
  const [montoCambio, setMontoCambio] = useState(null)
  const [modoOtro, setModoOtro] = useState(false)
  const [montoOtro, setMontoOtro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorConfirmacion, setErrorConfirmacion] = useState('')
  const [stockFaltante, setStockFaltante] = useState(null)
  const [errorCliente, setErrorCliente] = useState('')
  const [errorReferencia, setErrorReferencia] = useState('')
  const [pedidoCreado, setPedidoCreado] = useState(null)
  const [alertaPrecio, setAlertaPrecio] = useState(null)

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

  useEffect(() => {
    let activo = true
    ;(async () => {
      try {
        const datosClientes = await listarClientes()
        if (!activo) return
        setClientes(datosClientes)
      } catch {
        // clientes son opcionales: se puede capturar el pedido sin ellos
      }
    })()
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    if (tipo && !METODOS_PAGO[tipo].includes(metodoPago)) {
      setMetodoPago('Efectivo')
      setMontoCambio(null)
      setModoOtro(false)
      setMontoOtro('')
    }
  }, [tipo, metodoPago])

  const productosMitad = useMemo(
    () => (productos || []).filter((p) => p.permiteMitadYMitad),
    [productos],
  )

  const tieneConfiguracion = (producto) =>
    producto.tipo === 'Con_receta' ||
    producto.permiteMitadYMitad ||
    (producto.productoModificadores || []).some((pm) => pm.modificador?.estado === 'Activo')

  const seleccionarProducto = (producto) => {
    if (tieneConfiguracion(producto)) {
      setModalProducto(producto)
      return
    }
    agregarLinea(setTicket, {
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
    const productosDelCombo = (combo.productos || []).filter((cp) => cp.producto)
    const algunoConConfig = productosDelCombo.some(
      (cp) =>
        cp.producto.tipo === 'Con_receta' ||
        (cp.producto.productoModificadores || []).some(
          (pm) => pm.modificador?.estado === 'Activo',
        ),
    )
    if (algunoConConfig) {
      setModalCombo(combo)
      return
    }
    agregarLinea(setTicket, {
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

  const manejarAgregarCombo = (config) => {
    agregarLinea(setTicket, config)
    setModalCombo(null)
  }

  const manejarAgregarModal = (config) => {
    agregarLinea(setTicket, {
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
    })
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
    if (stockFaltante?.length > 0) setStockFaltante(null)
  }

  const subtotalDe = (item) => {
    const costoMods =
      item.tipoLinea === 'combo'
        ? (item.productos || []).reduce(
            (acc, p) =>
              acc +
              (p.modificadores || []).reduce(
                (s, m) => s + (m.tipo === 'Agregar' ? m.costoAdicional || 0 : 0),
                0,
              ),
            0,
          )
        : item.modificadores.reduce((acc, m) => acc + (m.costoAdicional || 0), 0)
    return (item.precioUnitario + costoMods) * item.cantidad
  }

  const total = useMemo(() => ticket.reduce((acc, item) => acc + subtotalDe(item), 0), [ticket])

  const clientesFiltrados = useMemo(() => {
    const termino = clienteBusqueda.trim().toLowerCase()
    if (!termino) return []
    return (clientes || [])
      .filter((c) => c.estado === 'Activo' && c.nombre.toLowerCase().includes(termino))
      .slice(0, 6)
  }, [clientes, clienteBusqueda])

  const metodosPagoValidos = tipo ? METODOS_PAGO[tipo] || [] : []
  const costoEnvioAplicado = tipo === 'A_domicilio' && !noCobrar ? costoEnvio : 0
  const totalConEnvio = total + costoEnvioAplicado
  const maxOpcionCambio = opcionesCambio.length > 0 ? Math.max(...opcionesCambio) : 0
  const permiteOtroDomicilio = tipo === 'A_domicilio' && totalConEnvio > maxOpcionCambio
  const montoOtroNumerico = montoOtro !== '' ? Number(montoOtro) : null
  const montoEfectivo = modoOtro ? montoOtroNumerico : montoCambio
  const cambio = montoEfectivo != null ? montoEfectivo - totalConEnvio : null

  const seleccionarCliente = (c) => {
    setCliente(c)
    setReferenciaId(null)
    setClienteBusqueda('')
  }

  const crearNuevoCliente = async (e) => {
    e.preventDefault()
    if (!nuevoCliente.nombre.trim()) {
      setErrorCliente('Escribe el nombre del cliente')
      return
    }
    setErrorCliente('')
    try {
      const nuevo = await crearCliente({
        nombre: nuevoCliente.nombre.trim(),
        telefono: nuevoCliente.telefono.trim() || undefined,
      })
      setClientes((cs) => (cs ? [...cs, nuevo] : [nuevo]))
      setCliente(nuevo)
      setModoCliente('registrado')
      setNuevoCliente({ nombre: '', telefono: '' })
      setMostrarNuevoCliente(false)
    } catch (err) {
      setErrorCliente(err.message)
    }
  }

  const agregarNuevaReferencia = async (e) => {
    e.preventDefault()
    if (!cliente || !nuevaReferencia.trim()) return
    setErrorReferencia('')
    try {
      const ref = await crearReferencia(cliente.id, nuevaReferencia.trim())
      const actualizado = { ...cliente, referencias: [...(cliente.referencias || []), ref] }
      setCliente(actualizado)
      setClientes((cs) => (cs ? cs.map((c) => (c.id === actualizado.id ? actualizado : c)) : cs))
      setReferenciaId(ref.id)
      setNuevaReferencia('')
      setMostrarNuevaReferencia(false)
    } catch (err) {
      setErrorReferencia(err.message)
    }
  }

  const confirmarPedido = async (usarDisponible = false) => {
    setErrorConfirmacion('')
    setStockFaltante(null)
    if (ticket.length === 0 || !tipo) return

    if (tipo === 'A_domicilio') {
      if (modoCliente === 'registrado') {
        if (!cliente) {
          setErrorConfirmacion('Selecciona un cliente o usa "Nombre libre" para el envío')
          return
        }
        if (!referenciaId) {
          setErrorConfirmacion('Selecciona una referencia de entrega (o agrega una nueva)')
          return
        }
      } else if (!nombreClienteLibre.trim()) {
        setErrorConfirmacion('Escribe el nombre para el envío a domicilio')
        return
      }
      if (modoCliente === 'libre' && !referenciaLibre.trim()) {
        setErrorConfirmacion('Escribe la referencia o dirección de entrega')
        return
      }
    }

    const requiereMonto = !noCobrar && metodoPago === 'Efectivo'
    if (requiereMonto && montoEfectivo == null) {
      setErrorConfirmacion('Selecciona con cuánto paga el cliente')
      return
    }
    if (requiereMonto && montoEfectivo < totalConEnvio) {
      setErrorConfirmacion('El monto con el que paga el cliente no cubre el total')
      return
    }

    const productosEnvio = ticket.map((item) =>
      item.tipoLinea === 'combo'
        ? {
            comboId: item.comboId,
            cantidad: item.cantidad,
            nota: item.nota,
            productos: (item.productos || []).map((p) => ({
              productoId: p.productoId,
              nota: p.nota,
              modificadores: p.modificadores.map((m) => ({
                modificadorId: m.id,
              })),
            })),
          }
        : {
            productoId: item.productoId,
            cantidad: item.cantidad,
            esMitadYMitad: item.esMitadYMitad,
            ...(item.esMitadYMitad && item.sabor1 && item.sabor2
              ? { sabor1ProductoId: item.sabor1.id, sabor2ProductoId: item.sabor2.id }
              : {}),
            modificadores: item.modificadores.map((m) => ({
              modificadorId: m.id,
            })),
            nota: item.nota,
          },
    )

    const payload = {
      tipo,
      origen,
      productos: productosEnvio,
      noCobrar,
      ...(modoCliente === 'registrado' && cliente
        ? { clienteId: cliente.id }
        : { nombreClienteLibre: nombreClienteLibre.trim() }),
      ...(tipo === 'A_domicilio' && modoCliente === 'registrado' && referenciaId
        ? { referenciaId }
        : {}),
      ...(tipo === 'A_domicilio' && modoCliente === 'libre'
        ? { referenciaLibre: referenciaLibre.trim() }
        : {}),
      metodoPago,
      ...(requiereMonto ? { montoReferenciaPago: montoEfectivo } : {}),
      ...(usarDisponible ? { usarDisponible: true } : {}),
    }

    setEnviando(true)
    try {
      const pedido = await crearPedido(payload)
      if (Math.round(pedido.total * 100) !== Math.round(totalConEnvio * 100)) {
        setAlertaPrecio({ esperado: totalConEnvio, real: pedido.total, pedido })
      } else {
        setPedidoCreado(pedido)
      }
    } catch (err) {
      if (err.stockInsuficiente) setStockFaltante(err.stockInsuficiente)
      else setErrorConfirmacion(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const cargando = productos === null && !error

  return (
    <main className="min-h-screen bg-surface pb-16">
      <BannerToaster
        error={error || errorConfirmacion}
        onCerrarError={() => {
          setError('')
          setErrorConfirmacion('')
        }}
      />
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

        <div className={`mt-6 ${tipo ? '' : 'pointer-events-none select-none opacity-40'}`}>
          <section className="space-y-6">
            <section>
              <EtiquetaSeccion>Origen del pedido</EtiquetaSeccion>
              <div className="rounded-3xl bg-card p-2 shadow-card">
                <div className="grid grid-cols-2 gap-1 rounded-full bg-input p-1">
                  {ORIGENES_PEDIDO.map((o) => {
                    const activo = origen === o.id
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setOrigen(o.id)}
                        aria-pressed={activo}
                        className={`rounded-full px-3 py-3.5 text-base font-semibold transition ${
                          activo
                            ? 'bg-card text-accent shadow-card'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {o.etiqueta}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            <section>
              <EtiquetaSeccion>Cliente</EtiquetaSeccion>
              <div className="rounded-3xl bg-card p-4 shadow-card">
                <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-input p-1">
                  {[
                    { id: 'registrado', etiqueta: 'Cliente' },
                    { id: 'libre', etiqueta: 'Nombre libre' },
                  ].map((modo) => {
                    const activo = modoCliente === modo.id
                    return (
                      <button
                        key={modo.id}
                        type="button"
                        onClick={() => setModoCliente(modo.id)}
                        aria-pressed={activo}
                        className={`rounded-full px-3 py-2.5 text-sm font-semibold transition ${
                          activo
                            ? 'bg-card text-accent shadow-card'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {modo.etiqueta}
                      </button>
                    )
                  })}
                </div>

                {modoCliente === 'libre' ? (
                  <div className="space-y-3">
                    <label>
                      <span className="mb-1 block text-xs font-medium text-muted">
                        {tipo === 'A_domicilio' ? 'Nombre para el envío' : 'Nombre'}
                      </span>
                      <input
                        type="text"
                        value={nombreClienteLibre}
                        onChange={(e) => setNombreClienteLibre(e.target.value)}
                        placeholder={
                          tipo === 'A_domicilio'
                            ? 'Ej. Ana Martínez, Av. Principal 12'
                            : 'Ej. Cliente de mostrador'
                        }
                        className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                      />
                    </label>
                    {tipo === 'A_domicilio' && (
                      <label>
                        <span className="mb-1 block text-xs font-medium text-muted">
                          Referencia / dirección de entrega
                        </span>
                        <textarea
                          value={referenciaLibre}
                          onChange={(e) => setReferenciaLibre(e.target.value)}
                          placeholder="Ej. casa azul, frente a la tienda, sobre la avenida…"
                          rows={2}
                          className="w-full resize-none rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label>
                      <span className="mb-1 block text-xs font-medium text-muted">
                        Buscar cliente
                      </span>
                      <input
                        type="text"
                        value={clienteBusqueda}
                        onChange={(e) => setClienteBusqueda(e.target.value)}
                        placeholder="Escribe para buscar…"
                        className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                      />
                    </label>

                    {clientesFiltrados.length > 0 && (
                      <ul className="space-y-2">
                        {clientesFiltrados.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => seleccionarCliente(c)}
                              className="w-full rounded-2xl bg-surface px-4 py-3 text-left transition active:scale-[0.98]"
                            >
                              <span className="block text-sm font-semibold text-ink">
                                {c.nombre}
                              </span>
                              {c.telefono && (
                                <span className="block text-xs text-muted">{c.telefono}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {cliente ? (
                      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {cliente.nombre}
                          </p>
                          {cliente.telefono && (
                            <p className="text-xs text-muted">{cliente.telefono}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCliente(null)
                            setReferenciaId(null)
                          }}
                          aria-label="Quitar cliente"
                          className="shrink-0 rounded-full p-1.5 text-muted transition hover:text-danger active:scale-90"
                        >
                          <IconoEquis className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      !mostrarNuevoCliente && (
                        <button
                          type="button"
                          onClick={() => setMostrarNuevoCliente(true)}
                          className="w-full rounded-2xl border border-dashed border-muted/40 px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/5"
                        >
                          + Nuevo cliente
                        </button>
                      )
                    )}

                    {mostrarNuevoCliente && (
                      <form onSubmit={crearNuevoCliente} className="space-y-3 rounded-2xl bg-surface p-4">
                        <label>
                          <span className="mb-1 block text-xs font-medium text-muted">Nombre</span>
                          <input
                            type="text"
                            value={nuevoCliente.nombre}
                            onChange={(e) =>
                              setNuevoCliente((n) => ({ ...n, nombre: e.target.value }))
                            }
                            placeholder="Nombre del cliente"
                            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                          />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium text-muted">
                            Teléfono (opcional)
                          </span>
                          <input
                            type="tel"
                            value={nuevoCliente.telefono}
                            onChange={(e) =>
                              setNuevoCliente((n) => ({ ...n, telefono: e.target.value }))
                            }
                            placeholder="Ej. 55 1234 5678"
                            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                          />
                        </label>
                        {errorCliente && (
                          <p className="text-sm font-medium text-danger">{errorCliente}</p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="md"
                            className="flex-1"
                            onClick={() => {
                              setMostrarNuevoCliente(false)
                              setErrorCliente('')
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button size="md" className="flex-1" type="submit">
                            Guardar cliente
                          </Button>
                        </div>
                      </form>
                    )}

                    {tipo === 'A_domicilio' && cliente && (
                      <div className="space-y-2 border-t border-muted/10 pt-3">
                        <p className="text-xs font-semibold text-muted">Referencia de entrega</p>
                        {cliente.referencias && cliente.referencias.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {cliente.referencias
                              .filter((r) => r.estado === 'Activo')
                              .map((r) => {
                                const activo = referenciaId === r.id
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => setReferenciaId(activo ? null : r.id)}
                                    aria-pressed={activo}
                                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                      activo
                                        ? 'bg-accent text-white shadow-card'
                                        : 'bg-surface text-ink hover:bg-muted/10'
                                    }`}
                                  >
                                    {r.descripcion}
                                  </button>
                                )
                              })}
                          </div>
                        )}
                        {!mostrarNuevaReferencia ? (
                          <button
                            type="button"
                            onClick={() => setMostrarNuevaReferencia(true)}
                            className="text-sm font-semibold text-accent"
                          >
                            + Agregar nueva referencia
                          </button>
                        ) : (
                          <form onSubmit={agregarNuevaReferencia} className="flex gap-2">
                            <input
                              type="text"
                              value={nuevaReferencia}
                              onChange={(e) => setNuevaReferencia(e.target.value)}
                              placeholder="Ej. casa azul, frente a la tienda"
                              className="min-w-0 flex-1 rounded-2xl border-none bg-input px-4 py-2.5 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                            />
                            <Button size="md" type="submit" disabled={!nuevaReferencia.trim()}>
                              Agregar
                            </Button>
                          </form>
                        )}
                        {errorReferencia && (
                          <p className="text-sm font-medium text-danger">{errorReferencia}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-4 rounded-3xl bg-card p-4 shadow-card">
                <div>
                  <p className="text-base font-semibold text-ink">No cobrar</p>
                  <p className="text-sm text-muted">Consumo interno, sin generar pago</p>
                </div>
                <Interruptor activo={noCobrar} onChange={setNoCobrar} ariaLabel="No cobrar" />
              </div>
            </section>

            {!noCobrar && metodosPagoValidos.length > 0 && (
              <section>
                <EtiquetaSeccion>Método de pago</EtiquetaSeccion>
                <div className="rounded-3xl bg-card p-4 shadow-card">
                  <div
                    className={`grid gap-1 rounded-full bg-input p-1 ${
                      metodosPagoValidos.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
                    }`}
                  >
                    {metodosPagoValidos.map((mp) => {
                      const activo = metodoPago === mp
                      return (
                        <button
                          key={mp}
                          type="button"
                          onClick={() => {
                            setMetodoPago(mp)
                            setMontoCambio(null)
                            setModoOtro(false)
                            setMontoOtro('')
                          }}
                          aria-pressed={activo}
                          className={`rounded-full px-3 py-3 text-sm font-semibold transition ${
                            activo
                              ? 'bg-card text-accent shadow-card'
                              : 'text-muted hover:text-ink'
                          }`}
                        >
                          {mp}
                        </button>
                      )
                    })}
                  </div>

                  {metodoPago === 'Efectivo' && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-semibold text-muted">Cliente paga con</p>
                      <div className="flex flex-wrap gap-2">
                        {opcionesCambio.map((monto) => {
                          const activo = !modoOtro && montoCambio === monto
                          const alcanza = monto >= totalConEnvio
                          return (
                            <button
                              key={monto}
                              type="button"
                              onClick={() => {
                                setModoOtro(false)
                                setMontoCambio(monto)
                              }}
                              aria-pressed={activo}
                              disabled={!alcanza}
                              className={`rounded-full px-4 py-2.5 text-base font-semibold transition disabled:opacity-35 ${
                                activo
                                  ? 'bg-accent text-white shadow-card'
                                  : 'bg-surface text-ink hover:bg-muted/10'
                              }`}
                            >
                              {formatearMonto(monto)}
                            </button>
                          )
                        })}
                        {(tipo === 'Para_recoger' || permiteOtroDomicilio) && (
                          <button
                            type="button"
                            onClick={() => {
                              setModoOtro(true)
                              setMontoCambio(null)
                            }}
                            aria-pressed={modoOtro}
                            className={`rounded-full px-4 py-2.5 text-base font-semibold transition ${
                              modoOtro
                                ? 'bg-accent text-white shadow-card'
                                : 'bg-surface text-ink hover:bg-muted/10'
                            }`}
                          >
                            Otro
                          </button>
                        )}
                      </div>

                      {(modoOtro && (tipo === 'Para_recoger' || permiteOtroDomicilio)) && (
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs font-medium text-muted">
                            Monto con el que paga
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={montoOtro}
                            onChange={(e) => setMontoOtro(e.target.value)}
                            placeholder="Ej. 35.50"
                            className="w-full rounded-2xl border-none bg-input px-4 py-3 text-base text-ink outline-none transition placeholder:text-muted/70 focus:ring-2 focus:ring-accent/40"
                          />
                          {montoOtroNumerico != null && montoOtroNumerico < totalConEnvio && (
                            <p className="mt-1 text-sm font-medium text-danger">
                              El monto no cubre el total ({formatearMonto(totalConEnvio)})
                            </p>
                          )}
                        </label>
                      )}

                      {cambio != null && (
                        <p className="mt-3 text-base font-semibold text-ink">
                          Cambio a llevar: <span className="text-accent">{formatearMonto(cambio)}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}
          </section>

          <div className="mt-6 lg:flex lg:items-start lg:gap-6">
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
                                <p className="break-words text-xs text-muted">
                                  {item.modificadores.map((m) => m.nombre).join(', ')}
                                </p>
                              )}
                              {item.tipoLinea === 'combo' && item.productos?.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {item.productos.map((p) => {
                                    const mods = (p.modificadores || [])
                                      .map((m) => m.nombre)
                                      .join(', ')
                                    return p.modificadores?.length > 0 || p.nota ? (
                                      <li key={p.productoId} className="break-words text-xs text-muted">
                                        <span className="font-semibold text-ink">{p.nombre}</span>
                                        {mods ? ` — ${mods}` : ''}
                                        {p.nota ? ` · Nota: ${p.nota}` : ''}
                                      </li>
                                    ) : null
                                  })}
                                </ul>
                              )}
                              {item.nota && (
                                <p className="break-words text-xs italic text-muted">
                                  {item.tipoLinea === 'combo' ? 'Nota del combo: ' : 'Nota: '}
                                  {item.nota}
                                </p>
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
                    {costoEnvioAplicado > 0 && (
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-muted">Envío</span>
                        <span className="text-sm font-semibold text-ink">
                          {formatearMonto(costoEnvioAplicado)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted">Total</span>
                      <span className="text-xl font-bold text-ink">
                        {formatearMonto(totalConEnvio)}
                      </span>
                    </div>
                    {errorConfirmacion && (
                      <p className="mt-3 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                        {errorConfirmacion}
                      </p>
                    )}
                    {stockFaltante?.length > 0 && (
                      <div className="mt-3 space-y-1.5 rounded-2xl bg-danger/5 px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-danger">
                          Stock insuficiente
                        </p>
                        {stockFaltante.map((f) => (
                          <p key={`${f.tipo}-${f.id}`} className="text-sm text-ink">
                            {f.nombre}: requerido {f.requerido} · disponible {f.disponible}
                          </p>
                        ))}
                        <button
                          type="button"
                          className="mt-1 w-full rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          disabled={enviando}
                          onClick={() => confirmarPedido(true)}
                        >
                          {enviando ? 'Enviando…' : 'Usar lo disponible'}
                        </button>
                      </div>
                    )}
                    <Button
                      className="mt-3 w-full"
                      disabled={ticket.length === 0 || enviando}
                      onClick={() => confirmarPedido()}
                    >
                      {enviando ? 'Creando pedido…' : 'Confirmar pedido'}
                    </Button>
                  </footer>
                </>
              )}
            </div>
          </aside>
          </div>
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

      {modalCombo && (
        <ModalCombo
          key={modalCombo.id}
          combo={modalCombo}
          onCancelar={() => setModalCombo(null)}
          onAgregar={manejarAgregarCombo}
        />
      )}

      {alertaPrecio && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm" />
          <div className="relative mx-4 w-full max-w-md animate-[sheet-up_280ms_ease-out] rounded-3xl bg-card p-8 text-center shadow-card">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger">
              <IconoAlerta />
            </div>
            <h2 className="text-xl font-bold text-ink">El precio cambió mientras armabas el pedido</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              El total real es{' '}
              <span className="font-semibold text-ink">{formatearMonto(alertaPrecio.real)}</span>, no{' '}
              <span className="font-semibold text-danger">{formatearMonto(alertaPrecio.esperado)}</span>{' '}
              que se mostró en pantalla. Revisa antes de continuar.
            </p>
            <div className="mt-6">
              <Button
                className="w-full"
                onClick={() => {
                  setPedidoCreado(alertaPrecio.pedido)
                  setAlertaPrecio(null)
                }}
              >
                Entendido, ver el pedido
              </Button>
            </div>
          </div>
        </div>
      )}

      {pedidoCreado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 animate-[fade-in_200ms_ease-out] bg-ink/40 backdrop-blur-sm"
            onClick={() => navigate('/')}
          />
          <div className="relative mx-4 w-full max-w-md animate-[sheet-up_280ms_ease-out] rounded-3xl bg-card p-8 text-center shadow-card">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
              <IconoCheck />
            </div>
            <h2 className="text-xl font-bold text-ink">Pedido #{pedidoCreado.id} creado</h2>
            <p className="mt-1 text-sm text-muted">
              {pedidoCreado.estadoPago === 'Pagado'
                ? 'Cobrado y registrado'
                : 'Pago pendiente'}{' '}
              · {formatearMonto(pedidoCreado.total)}
            </p>
            {pedidoCreado.cambioALlevar != null && (
              <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-base font-semibold text-ink">
                Cambio a llevar: {formatearMonto(pedidoCreado.cambioALlevar)}
              </p>
            )}
            <div className="mt-6 space-y-2">
              <Button className="w-full" onClick={() => navigate('/')}>
                Ir a Pedidos
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => window.location.reload()}
              >
                Crear otro pedido
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default NuevoPedidoPage
