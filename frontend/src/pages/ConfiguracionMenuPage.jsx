import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import ModalHoja from '../components/ui/ModalHoja'
import {
  crearIngrediente,
  actualizarIngrediente,
  desactivarIngrediente,
  eliminarIngrediente,
  obtenerIngredientes,
  crearProducto,
  actualizarProducto,
  actualizarDisponibilidadProducto,
  desactivarProducto,
  eliminarProducto,
  obtenerProductos,
} from '../services/menu'

const UNIDADES = [
  { id: 'kg', etiqueta: 'Kilogramos (kg)' },
  { id: 'g', etiqueta: 'Gramos (g)' },
  { id: 'l', etiqueta: 'Litros (l)' },
  { id: 'ml', etiqueta: 'Mililitros (ml)' },
  { id: 'pieza', etiqueta: 'Piezas' },
]

const TIPOS_PRODUCTO = [
  { id: 'Con_receta', etiqueta: 'Con receta' },
  { id: 'Reventa_directa', etiqueta: 'Reventa directa' },
]

const CLASE_INPUT =
  'w-full rounded-2xl border-0 bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

const ETIQUETA_TIPO = {
  Con_receta: 'Con receta',
  Reventa_directa: 'Reventa directa',
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

function estadoStock(ing) {
  if (ing.stockActual < 0) return { color: 'text-danger', etiqueta: 'Negativo' }
  if (ing.stockActual < ing.stockMinimoAlerta) return { color: 'text-amber-600', etiqueta: 'Bajo' }
  return { color: 'text-ink', etiqueta: null }
}

function selectorPestanasClases(activo) {
  return `rounded-full px-3 py-2.5 text-sm font-semibold transition ${
    activo ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
  }`
}

function ModalFormularioIngrediente({ ingrediente, onCerrar, onGuardar }) {
  const esNuevo = !ingrediente
  const [nombre, setNombre] = useState(ingrediente?.nombre ?? '')
  const [unidadMedida, setUnidadMedida] = useState(ingrediente?.unidadMedida ?? 'kg')
  const [stockActual, setStockActual] = useState('')
  const [stockMinimoAlerta, setStockMinimoAlerta] = useState(
    ingrediente?.stockMinimoAlerta != null ? String(ingrediente.stockMinimoAlerta) : '',
  )
  const [costoUltimaCompra, setCostoUltimaCompra] = useState(
    ingrediente?.costoUltimaCompra != null ? String(ingrediente.costoUltimaCompra) : '',
  )
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Escribe el nombre del ingrediente')
    if (esNuevo && (stockActual === '' || Number(stockActual) < 0)) {
      return setError('El stock inicial debe ser mayor o igual a 0')
    }
    if (stockMinimoAlerta === '' || Number(stockMinimoAlerta) < 0) {
      return setError('La alerta mínima debe ser mayor o igual a 0')
    }
    const payload = {
      nombre: nombre.trim(),
      unidadMedida,
      stockMinimoAlerta: Number(stockMinimoAlerta),
      costoUltimaCompra: costoUltimaCompra === '' ? null : Number(costoUltimaCompra),
    }
    if (esNuevo) payload.stockActual = Number(stockActual)
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
      titulo={esNuevo ? 'Nuevo ingrediente' : 'Editar ingrediente'}
      subtitulo={
        esNuevo ? 'El stock inicial se registra como una entrada de inventario.' : undefined
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
          <label className="block text-sm font-semibold text-ink" htmlFor="ing-nombre">
            Nombre
          </label>
          <input
            id="ing-nombre"
            className={CLASE_INPUT}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Harina"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="ing-unidad">
            Unidad de medida
          </label>
          <select
            id="ing-unidad"
            className={CLASE_INPUT}
            value={unidadMedida}
            onChange={(e) => setUnidadMedida(e.target.value)}
          >
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.etiqueta}
              </option>
            ))}
          </select>
        </div>
        {esNuevo && (
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-ink" htmlFor="ing-stock">
              Stock inicial
            </label>
            <input
              id="ing-stock"
              className={CLASE_INPUT}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={stockActual}
              onChange={(e) => setStockActual(e.target.value)}
              placeholder="0"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="ing-alerta">
            Alerta mínima
          </label>
          <input
            id="ing-alerta"
            className={CLASE_INPUT}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={stockMinimoAlerta}
            onChange={(e) => setStockMinimoAlerta(e.target.value)}
            placeholder="0"
          />
          <p className="text-xs text-muted">
            El stock se marcará en naranja cuando baje de este nivel.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="ing-costo">
            Costo de compra (opcional)
          </label>
          <input
            id="ing-costo"
            className={CLASE_INPUT}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={costoUltimaCompra}
            onChange={(e) => setCostoUltimaCompra(e.target.value)}
            placeholder="Costo por unidad"
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

function FilaReceta({ fila, ingredientes, onChange, onQuitar, puedeQuitar }) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-xs font-semibold text-muted">Ingrediente</label>
        <select
          className={CLASE_INPUT}
          value={fila.ingredienteId}
          onChange={(e) => onChange({ ...fila, ingredienteId: e.target.value })}
        >
          <option value="">Selecciona…</option>
          {ingredientes.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.nombre} ({ing.unidadMedida})
            </option>
          ))}
        </select>
      </div>
      <div className="w-24">
        <label className="mb-1 block text-xs font-semibold text-muted">Cantidad</label>
        <input
          className={CLASE_INPUT}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={fila.cantidad}
          onChange={(e) => onChange({ ...fila, cantidad: e.target.value })}
          placeholder="0"
        />
      </div>
      {puedeQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar ingrediente"
          className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition hover:text-danger active:scale-95"
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
  )
}

function ModalFormularioProducto({ producto, ingredientes, onCerrar, onGuardar }) {
  const esNuevo = !producto
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [precio, setPrecio] = useState(producto ? String(producto.precio) : '')
  const [tipo, setTipo] = useState(producto?.tipo ?? 'Con_receta')
  const [permiteMitadYMitad, setPermiteMitadYMitad] = useState(producto?.permiteMitadYMitad ?? false)
  const [filas, setFilas] = useState(() => {
    if (producto?.productoIngredientes?.length) {
      return producto.productoIngredientes.map((pi) => ({
        ingredienteId: String(pi.ingredienteId),
        cantidad: String(pi.cantidad),
      }))
    }
    return [{ ingredienteId: '', cantidad: '' }]
  })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Escribe el nombre del producto')
    if (precio === '' || Number(precio) < 0) return setError('El precio debe ser mayor o igual a 0')

    const payload = { nombre: nombre.trim(), precio: Number(precio), tipo }
    if (tipo === 'Con_receta') {
      const filasValidas = filas.filter((f) => f.ingredienteId && f.cantidad !== '')
      if (filasValidas.length === 0) return setError('Agrega al menos un ingrediente con su cantidad')
      if (filasValidas.some((f) => Number(f.cantidad) <= 0)) {
        return setError('Las cantidades de la receta deben ser mayores a 0')
      }
      const ids = filasValidas.map((f) => Number(f.ingredienteId))
      if (new Set(ids).size !== ids.length) return setError('No repitas el mismo ingrediente en la receta')
      payload.ingredientes = filasValidas.map((f) => ({
        ingredienteId: Number(f.ingredienteId),
        cantidad: Number(f.cantidad),
      }))
      payload.permiteMitadYMitad = permiteMitadYMitad
    }

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
      titulo={esNuevo ? 'Nuevo producto' : 'Editar producto'}
      subtitulo="Los ingredientes de la receta se descuentan automáticamente del inventario al vender."
      onCerrar={onCerrar}
    >
      <form onSubmit={guardar} className="space-y-5">
        {error && (
          <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="prod-nombre">
            Nombre
          </label>
          <input
            id="prod-nombre"
            className={CLASE_INPUT}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Hamburguesa"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="prod-precio">
            Precio
          </label>
          <input
            id="prod-precio"
            className={CLASE_INPUT}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <span className="block text-sm font-semibold text-ink">Tipo</span>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-input p-1">
            {TIPOS_PRODUCTO.map((opcion) => {
              const activo = tipo === opcion.id
              return (
                <button
                  key={opcion.id}
                  type="button"
                  onClick={() => setTipo(opcion.id)}
                  aria-pressed={activo}
                  className={selectorPestanasClases(activo)}
                >
                  {opcion.etiqueta}
                </button>
              )
            })}
          </div>
        </div>
        {tipo === 'Con_receta' && (
          <>
            <div className="space-y-2">
              <span className="block text-sm font-semibold text-ink">Receta</span>
              <div className="space-y-3">
                {filas.map((fila, idx) => (
                  <FilaReceta
                    key={idx}
                    fila={fila}
                    ingredientes={ingredientes}
                    puedeQuitar={filas.length > 1}
                    onChange={(nueva) =>
                      setFilas((fs) => fs.map((f, i) => (i === idx ? nueva : f)))
                    }
                    onQuitar={() => setFilas((fs) => fs.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFilas((fs) => [...fs, { ingredienteId: '', cantidad: '' }])}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition active:scale-[0.97]"
              >
                <IconoMas /> Agregar ingrediente
              </button>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">Permite mitad y mitad</span>
              <input
                type="checkbox"
                checked={permiteMitadYMitad}
                onChange={(e) => setPermiteMitadYMitad(e.target.checked)}
                className="h-5 w-5 accent-[#007aff]"
              />
            </label>
          </>
        )}
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

function ModalConfirmar({ titulo, mensaje, onConfirmar, onCancelar, confirmarEtiqueta, variante, children }) {
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

function ConfiguracionMenuPage() {
  const navigate = useNavigate()
  const [pestana, setPestana] = useState('ingredientes')
  const [ingredientes, setIngredientes] = useState(null)
  const [productos, setProductos] = useState(null)
  const [errorLista, setErrorLista] = useState('')
  const [notificacion, setNotificacion] = useState('')

  const [modalIngrediente, setModalIngrediente] = useState(null)
  const [desactivarIng, setDesactivarIng] = useState(null)
  const [desactivandoIng, setDesactivandoIng] = useState(null)
  const [eliminarIng, setEliminarIng] = useState(null)
  const [eliminandoIng, setEliminandoIng] = useState(false)

  const [modalProducto, setModalProducto] = useState(null)
  const [desactivarProd, setDesactivarProd] = useState(null)
  const [desactivandoProd, setDesactivandoProd] = useState(false)
  const [eliminarProd, setEliminarProd] = useState(null)
  const [eliminandoProd, setEliminandoProd] = useState(false)
  const [avisoCombos, setAvisoCombos] = useState(null)

  useEffect(() => {
    let activo = true
    Promise.allSettled([obtenerIngredientes(), obtenerProductos()]).then(([ri, rp]) => {
      if (!activo) return
      if (ri.status === 'fulfilled') setIngredientes(ri.value)
      else setErrorLista((e) => e || ri.reason.message)
      if (rp.status === 'fulfilled') setProductos(rp.value)
      else setErrorLista((e) => e || rp.reason.message)
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

  const recargarIngredientes = () => {
    obtenerIngredientes()
      .then(setIngredientes)
      .catch((err) => setErrorLista(err.message))
  }

  const recargarProductos = () => {
    obtenerProductos()
      .then(setProductos)
      .catch((err) => setErrorLista(err.message))
  }

  const reitentar = () => {
    setErrorLista('')
    setIngredientes(null)
    setProductos(null)
    Promise.allSettled([obtenerIngredientes(), obtenerProductos()]).then(([ri, rp]) => {
      if (ri.status === 'fulfilled') setIngredientes(ri.value)
      else setErrorLista((e) => e || ri.reason.message)
      if (rp.status === 'fulfilled') setProductos(rp.value)
      else setErrorLista((e) => e || rp.reason.message)
    })
  }

  // ------------------------- Ingredientes -------------------------

  const guardarIngrediente = (payload) =>
    modalIngrediente.modo === 'editar'
      ? actualizarIngrediente(modalIngrediente.ingrediente.id, payload).then(() => {
          setNotificacion('Ingrediente actualizado')
          recargarIngredientes()
        })
      : crearIngrediente(payload).then(() => {
          setNotificacion('Ingrediente creado')
          recargarIngredientes()
        })

  const iniciarDesactivarIngrediente = async (ing) => {
    setDesactivandoIng(ing.id)
    setNotificacion('')
    try {
      const res = await desactivarIngrediente(ing.id)
      if (res.status === 409 && res.datos.requiereConfirmacion) {
        setDesactivarIng({ ingrediente: ing, datos: res.datos })
      } else {
        setNotificacion(res.datos.mensaje || 'Ingrediente desactivado')
        recargarIngredientes()
      }
    } catch (err) {
      setErrorLista(err.message)
    } finally {
      setDesactivandoIng(null)
    }
  }

  const confirmarDesactivarIngrediente = async (opcion) => {
    const pendiente = desactivarIng
    setDesactivandoIng(pendiente.ingrediente.id)
    try {
      const res = await desactivarIngrediente(pendiente.ingrediente.id, opcion)
      if (res.status === 200) {
        setNotificacion(res.datos.mensaje || 'Ingrediente desactivado')
        recargarIngredientes()
        recargarProductos()
        if (res.datos.aviso) {
          setAvisoCombos({ titulo: 'Combos suspendidos', mensaje: res.datos.aviso.mensaje, combos: res.datos.aviso.combosSuspendidos })
        }
      }
      setDesactivarIng(null)
    } catch (err) {
      setErrorLista(err.message)
    } finally {
      setDesactivandoIng(null)
    }
  }

  const confirmarEliminarIngrediente = async () => {
    if (!eliminarIng) return
    setEliminandoIng(true)
    try {
      await eliminarIngrediente(eliminarIng.ingrediente.id)
      setEliminarIng(null)
      setNotificacion('Ingrediente eliminado')
      recargarIngredientes()
    } catch (err) {
      setEliminarIng((p) => (p ? { ...p, error: err.message } : p))
    } finally {
      setEliminandoIng(false)
    }
  }

  // ------------------------- Productos -------------------------

  const guardarProducto = (payload) =>
    modalProducto.modo === 'editar'
      ? actualizarProducto(modalProducto.producto.id, payload).then(() => {
          setNotificacion('Producto actualizado')
          recargarProductos()
        })
      : crearProducto(payload).then(() => {
          setNotificacion('Producto creado')
          recargarProductos()
        })

  const alternarDisponibilidad = async (prod) => {
    try {
      const res = await actualizarDisponibilidadProducto(prod.id, !prod.disponibleHoy)
      setProductos((ps) =>
        (ps || []).map((p) => (p.id === prod.id ? { ...p, disponibleHoy: res.producto.disponibleHoy } : p)),
      )
      if (res.aviso) {
        setAvisoCombos({ titulo: 'Combos suspendidos', mensaje: res.aviso.mensaje, combos: res.aviso.combosSuspendidos })
      }
    } catch (err) {
      setErrorLista(err.message)
    }
  }

  const confirmarDesactivarProducto = async () => {
    if (!desactivarProd) return
    setDesactivandoProd(true)
    try {
      const res = await desactivarProducto(desactivarProd.producto.id)
      setDesactivarProd(null)
      setNotificacion(res.mensaje || 'Producto desactivado')
      if (res.aviso) {
        setAvisoCombos({ titulo: 'Combos suspendidos', mensaje: res.aviso.mensaje, combos: res.aviso.combosSuspendidos })
      }
      recargarProductos()
    } catch (err) {
      setErrorLista(err.message)
      setDesactivarProd(null)
    } finally {
      setDesactivandoProd(false)
    }
  }

  const confirmarEliminarProducto = async () => {
    if (!eliminarProd) return
    setEliminandoProd(true)
    try {
      await eliminarProducto(eliminarProd.producto.id)
      setEliminarProd(null)
      setNotificacion('Producto eliminado')
      recargarProductos()
    } catch (err) {
      setEliminarProd((p) => (p ? { ...p, error: err.message } : p))
    } finally {
      setEliminandoProd(false)
    }
  }

  const cargandoInicial = !errorLista && ingredientes === null && productos === null
  const enPestanaIngredientes = pestana === 'ingredientes'

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
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Configuración de menú</h1>
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
            { id: 'ingredientes', etiqueta: 'Ingredientes' },
            { id: 'productos', etiqueta: 'Productos' },
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

        {errorLista && ingredientes === null && productos === null && (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center shadow-card">
            <p className="text-sm text-muted">No se pudieron cargar los datos.</p>
            <Button variant="secondary" size="md" onClick={reitentar}>
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

        {!cargandoInicial && enPestanaIngredientes && ingredientes !== null && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <EtiquetaSeccion>
                {ingredientes.length} ingrediente{ingredientes.length === 1 ? '' : 's'}
              </EtiquetaSeccion>
              <Button size="md" onClick={() => setModalIngrediente({ modo: 'nuevo' })}>
                <IconoMas /> Nuevo ingrediente
              </Button>
            </div>

            {ingredientes.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">Aún no hay ingredientes. Crea el primero.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <ul className="divide-y divide-muted/10">
                  {ingredientes.map((ing) => {
                    const stock = estadoStock(ing)
                    const desactivado = ing.estado === 'Inactivo'
                    const ocupado = desactivandoIng === ing.id
                    return (
                      <li key={ing.id} className="flex items-center gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-ink">{ing.nombre}</p>
                            <InsigniaEstado estado={ing.estado} />
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            Stock:{' '}
                            <span className={`font-semibold ${stock.color}`}>
                              {ing.stockActual} {ing.unidadMedida}
                            </span>
                            {stock.etiqueta && (
                              <span className={`ml-1.5 font-semibold ${stock.color}`}>
                                · {stock.etiqueta}
                              </span>
                            )}
                            <span className="text-muted/70"> · mín. {ing.stockMinimoAlerta}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setModalIngrediente({ modo: 'editar', ingrediente: ing })}
                            className="rounded-full px-3 py-2 text-sm font-semibold text-accent transition active:scale-95"
                          >
                            Editar
                          </button>
                          {!desactivado && (
                            <button
                              type="button"
                              onClick={() => iniciarDesactivarIngrediente(ing)}
                              disabled={ocupado}
                              className="rounded-full px-3 py-2 text-sm font-semibold text-amber-600 transition active:scale-95 disabled:opacity-50"
                            >
                              {ocupado ? '…' : 'Desactivar'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEliminarIng({ ingrediente: ing, error: '' })}
                            className="rounded-full px-3 py-2 text-sm font-semibold text-danger transition active:scale-95"
                          >
                            Eliminar
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        {!cargandoInicial && !enPestanaIngredientes && productos !== null && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <EtiquetaSeccion>
                {productos.length} producto{productos.length === 1 ? '' : 's'}
              </EtiquetaSeccion>
              <Button size="md" onClick={() => setModalProducto({ modo: 'nuevo' })}>
                <IconoMas /> Nuevo producto
              </Button>
            </div>

            {productos.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">Aún no hay productos. Crea el primero.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <ul className="divide-y divide-muted/10">
                  {productos.map((prod) => {
                    const desactivado = prod.estado === 'Inactivo'
                    return (
                      <li key={prod.id} className="flex items-center gap-3 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-ink">{prod.nombre}</p>
                            <span className="shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                              {ETIQUETA_TIPO[prod.tipo]}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            <span className="font-semibold text-ink">${prod.precio}</span>
                            {prod.tipo === 'Con_receta' && (
                              <span className="text-muted/70">
                                {' '}
                                · {prod.productoIngredientes?.length || 0} ingrediente
                                {(prod.productoIngredientes?.length || 0) === 1 ? '' : 's'}
                                {prod.permiteMitadYMitad ? ' · mitad y mitad' : ''}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => alternarDisponibilidad(prod)}
                              aria-pressed={prod.disponibleHoy}
                              aria-label={`Disponible hoy ${prod.disponibleHoy ? 'activado' : 'desactivado'}`}
                              className={`relative h-7 w-12 rounded-full transition ${
                                prod.disponibleHoy ? 'bg-accent' : 'bg-muted/40'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
                                  prod.disponibleHoy ? 'left-[22px]' : 'left-0.5'
                                }`}
                              />
                            </button>
                            <span className="text-[10px] font-medium text-muted">Disponible</span>
                          </div>
                          <InsigniaEstado estado={prod.estado} />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setModalProducto({ modo: 'editar', producto: prod })}
                              className="rounded-full px-3 py-2 text-sm font-semibold text-accent transition active:scale-95"
                            >
                              Editar
                            </button>
                            {!desactivado && (
                              <button
                                type="button"
                                onClick={() => setDesactivarProd({ producto: prod })}
                                className="rounded-full px-3 py-2 text-sm font-semibold text-amber-600 transition active:scale-95"
                              >
                                Desactivar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEliminarProd({ producto: prod, error: '' })}
                              className="rounded-full px-3 py-2 text-sm font-semibold text-danger transition active:scale-95"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      {modalIngrediente && (
        <ModalFormularioIngrediente
          ingrediente={modalIngrediente.ingrediente}
          onCerrar={() => setModalIngrediente(null)}
          onGuardar={guardarIngrediente}
        />
      )}

      {modalProducto && (
        <ModalFormularioProducto
          producto={modalProducto.producto}
          ingredientes={ingredientes || []}
          onCerrar={() => setModalProducto(null)}
          onGuardar={guardarProducto}
        />
      )}

      {desactivarIng && (
        <ModalHoja
          abierto
          titulo="Desactivar ingrediente"
          subtitulo="Este ingrediente se usa en productos activos. ¿Cómo quieres proceder?"
          onCerrar={() => setDesactivarIng(null)}
        >
          <ul className="mt-2 space-y-1.5">
            {(desactivarIng.datos.productosAfectados || []).map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                <span className="text-sm font-semibold text-ink">{p.nombre}</span>
                <span className="text-xs text-muted">
                  {p.disponibleHoy ? 'Disponible hoy' : 'No disponible hoy'}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2.5">
            <button
              type="button"
              onClick={() => confirmarDesactivarIngrediente('vender_sin_el')}
              disabled={desactivandoIng !== null}
              className="inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-base font-semibold text-white shadow-[0_4px_14px_rgb(0_122_255/0.35)] transition duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
            >
              Vender sin este ingrediente
            </button>
            <button
              type="button"
              onClick={() => confirmarDesactivarIngrediente('suspender_productos')}
              disabled={desactivandoIng !== null}
              className="inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-base font-semibold text-white transition duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
            >
              Suspender esos productos
            </button>
            <button
              type="button"
              onClick={() => setDesactivarIng(null)}
              disabled={desactivandoIng !== null}
              className="inline-flex min-h-12 w-full select-none items-center justify-center gap-2 rounded-full bg-muted/10 px-5 py-3 text-base font-semibold text-ink transition duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </ModalHoja>
      )}

      {eliminarIng && (
        <ModalConfirmar
          titulo={eliminarIng.error ? 'No se pudo eliminar' : `¿Eliminar "${eliminarIng.ingrediente.nombre}"?`}
          mensaje={
            eliminarIng.error ||
            'Esta acción es definitiva. Si el ingrediente tiene registros, el sistema te lo impedirá con un mensaje.'
          }
          variante="danger"
          confirmarEtiqueta={eliminarIng.error ? 'Cerrar' : eliminandoIng ? 'Eliminando…' : 'Eliminar'}
          onCancelar={() => setEliminarIng(null)}
          onConfirmar={eliminarIng.error ? () => setEliminarIng(null) : confirmarEliminarIngrediente}
        />
      )}

      {desactivarProd && (
        <ModalConfirmar
          titulo={`¿Desactivar "${desactivarProd.producto.nombre}"?`}
          mensaje="El producto dejará de estar activo. Si participa en combos activos, se suspenderán automáticamente."
          variante="danger"
          confirmarEtiqueta={desactivandoProd ? 'Desactivando…' : 'Desactivar'}
          onCancelar={() => setDesactivarProd(null)}
          onConfirmar={confirmarDesactivarProducto}
        />
      )}

      {eliminarProd && (
        <ModalConfirmar
          titulo={eliminarProd.error ? 'No se pudo eliminar' : `¿Eliminar "${eliminarProd.producto.nombre}"?`}
          mensaje={
            eliminarProd.error ||
            'Esta acción es definitiva. Si el producto ya se vendió o tiene registros, el sistema te lo impedirá con un mensaje.'
          }
          variante="danger"
          confirmarEtiqueta={eliminarProd.error ? 'Cerrar' : eliminandoProd ? 'Eliminando…' : 'Eliminar'}
          onCancelar={() => setEliminarProd(null)}
          onConfirmar={eliminarProd.error ? () => setEliminarProd(null) : confirmarEliminarProducto}
        />
      )}

      {avisoCombos && (
        <ModalConfirmar
          titulo={avisoCombos.titulo}
          mensaje={avisoCombos.mensaje}
          confirmarEtiqueta="Entendido"
          onCancelar={() => setAvisoCombos(null)}
          onConfirmar={() => setAvisoCombos(null)}
        >
          <ul className="mt-3 space-y-1.5">
            {(avisoCombos.combos || []).map((c) => (
              <li key={c.id} className="rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-ink">
                {c.nombre}
              </li>
            ))}
          </ul>
        </ModalConfirmar>
      )}
    </main>
  )
}

export default ConfiguracionMenuPage
