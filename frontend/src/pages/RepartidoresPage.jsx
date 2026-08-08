import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import ModalHoja from '../components/ui/ModalHoja'
import { actualizarEmpleado, crearEmpleado, obtenerEmpleados } from '../services/empleados'

const ESTADOS_DISPONIBILIDAD = [
  { id: 'Disponible', etiqueta: 'Disponible' },
  { id: 'No_disponible_hoy', etiqueta: 'No disponible hoy' },
  { id: 'Inactivo', etiqueta: 'Inactivo' },
]

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

function estiloInsignia(estado) {
  if (estado === 'Disponible') return 'bg-green-500/10 text-green-700'
  if (estado === 'No_disponible_hoy') return 'bg-amber-500/15 text-amber-600'
  return 'bg-muted/10 text-muted'
}

function InsigniaEstado({ estado }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${estiloInsignia(estado)}`}
    >
      {estado}
    </span>
  )
}

function selectorEstadoClases(activo) {
  return `rounded-full px-2 py-2 text-xs font-semibold transition sm:text-sm ${
    activo ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
  }`
}

function ModalFormularioRepartidor({ repartidor, onCerrar, onGuardar }) {
  const esNuevo = !repartidor
  const [nombre, setNombre] = useState(repartidor?.nombre ?? '')
  const [usuario, setUsuario] = useState(repartidor?.usuario?.usuario ?? '')
  const [contraseña, setContraseña] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('Escribe el nombre del repartidor')
    if (!usuario.trim()) return setError('Escribe el usuario (login) del repartidor')
    if (esNuevo && contraseña.length < 3) {
      return setError('La contraseña debe tener al menos 3 caracteres')
    }

    const payload = { nombre: nombre.trim(), usuario: usuario.trim() }
    if (esNuevo) payload.contraseña = contraseña
    else if (contraseña) payload.contraseña = contraseña

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
      titulo={esNuevo ? 'Nuevo repartidor' : 'Editar repartidor'}
      subtitulo={
        esNuevo
          ? 'Se creará su usuario de acceso (tipo Repartidor) para que pueda iniciar sesión.'
          : 'Deja la contraseña en blanco para conservar la actual.'
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
          <label className="block text-sm font-semibold text-ink" htmlFor="rep-nombre">
            Nombre
          </label>
          <input
            id="rep-nombre"
            className={CLASE_INPUT}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Pedro Martínez"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="rep-usuario">
            Usuario (login)
          </label>
          <input
            id="rep-usuario"
            className={CLASE_INPUT}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Ej. pedro6"
            autoCapitalize="none"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-ink" htmlFor="rep-contraseña">
            Contraseña
          </label>
          <input
            id="rep-contraseña"
            className={CLASE_INPUT}
            type="password"
            value={contraseña}
            onChange={(e) => setContraseña(e.target.value)}
            placeholder={esNuevo ? 'Mínimo 3 caracteres' : 'Dejar en blanco para no cambiar'}
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

function RepartidoresPage() {
  const navigate = useNavigate()
  const [repartidores, setRepartidores] = useState(null)
  const [errorLista, setErrorLista] = useState('')
  const [notificacion, setNotificacion] = useState('')
  const [modalRepartidor, setModalRepartidor] = useState(null)
  const [cambiando, setCambiando] = useState(null)

  const cargar = () => {
    obtenerEmpleados()
      .then(setRepartidores)
      .catch((err) => setErrorLista(err.message))
  }

  useEffect(() => {
    let activo = true
    obtenerEmpleados()
      .then((datos) => {
        if (activo) setRepartidores(datos)
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

  const guardarRepartidor = (payload) => {
    if (modalRepartidor.modo === 'editar') {
      return actualizarEmpleado(modalRepartidor.repartidor.id, payload).then(() => {
        setNotificacion('Repartidor actualizado')
        cargar()
      })
    }
    return crearEmpleado(payload).then(() => {
      setNotificacion('Repartidor creado')
      cargar()
    })
  }

  const cambiarEstado = async (rep, estado) => {
    if (rep.estadoDisponibilidad === estado || cambiando === rep.id) return
    setCambiando(rep.id)
    setNotificacion('')
    setErrorLista('')
    try {
      const res = await actualizarEmpleado(rep.id, { estadoDisponibilidad: estado })
      setRepartidores((rs) =>
        (rs || []).map((r) =>
          r.id === rep.id ? { ...r, estadoDisponibilidad: res.estadoDisponibilidad } : r,
        ),
      )
      setNotificacion('Estado actualizado')
    } catch (err) {
      setErrorLista(err.message)
    } finally {
      setCambiando(null)
    }
  }

  const cargando = repartidores === null && !errorLista

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
          <h1 className="truncate text-xl font-bold text-ink sm:text-2xl">Repartidores</h1>
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

        {errorLista && repartidores === null && (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-card px-6 py-12 text-center shadow-card">
            <p className="text-sm text-muted">No se pudieron cargar los repartidores.</p>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setErrorLista('')
                setRepartidores(null)
                cargar()
              }}
            >
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

        {!cargando && repartidores !== null && (
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <EtiquetaSeccion>
                {repartidores.length} repartidor{repartidores.length === 1 ? '' : 'es'}
              </EtiquetaSeccion>
              <Button size="md" onClick={() => setModalRepartidor({ modo: 'nuevo' })}>
                <IconoMas /> Nuevo repartidor
              </Button>
            </div>

            {repartidores.length === 0 ? (
              <div className="rounded-3xl bg-card px-6 py-12 text-center shadow-card">
                <p className="text-sm text-muted">Aún no hay repartidores. Crea el primero.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl bg-card shadow-card">
                <ul className="divide-y divide-muted/10">
                  {repartidores.map((rep) => {
                    const ocupado = cambiando === rep.id
                    return (
                      <li key={rep.id} className="space-y-3 px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-ink">{rep.nombre}</p>
                              <InsigniaEstado estado={rep.estadoDisponibilidad} />
                            </div>
                            <p className="mt-0.5 text-xs text-muted">
                              Usuario (login):{' '}
                              <span className="font-semibold text-ink">
                                @{rep.usuario?.usuario || '—'}
                              </span>
                              <span className="text-muted/70">
                                {' '}
                                · {rep._count?.pedidos || 0} pedido
                                {(rep._count?.pedidos || 0) === 1 ? '' : 's'}
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setModalRepartidor({ modo: 'editar', repartidor: rep })
                              }
                              className="rounded-full px-3 py-2 text-sm font-semibold text-accent transition active:scale-95"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                        <div
                          role="group"
                          aria-label="Estado de disponibilidad"
                          className="grid grid-cols-3 gap-1 rounded-full bg-input p-1"
                        >
                          {ESTADOS_DISPONIBILIDAD.map((opcion) => {
                            const activo = rep.estadoDisponibilidad === opcion.id
                            return (
                              <button
                                key={opcion.id}
                                type="button"
                                onClick={() => cambiarEstado(rep, opcion.id)}
                                aria-pressed={activo}
                                disabled={ocupado}
                                className={`${selectorEstadoClases(activo)} disabled:opacity-50`}
                              >
                                {ocupado && activo ? '…' : opcion.etiqueta}
                              </button>
                            )
                          })}
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

      {modalRepartidor && (
        <ModalFormularioRepartidor
          repartidor={modalRepartidor.repartidor}
          onCerrar={() => setModalRepartidor(null)}
          onGuardar={guardarRepartidor}
        />
      )}
    </main>
  )
}

export default RepartidoresPage
