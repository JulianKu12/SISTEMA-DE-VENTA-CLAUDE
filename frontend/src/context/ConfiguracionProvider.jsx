import { useCallback, useEffect, useMemo, useState } from 'react'
import { actualizarConfiguracion, obtenerConfiguracion } from '../services/configuracion'
import { ConfiguracionContext } from './configuracionContext'

function ConfiguracionProvider({ children }) {
  const [config, setConfig] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const recargar = useCallback(async () => {
    setCargando(true)
    try {
      setConfig(await obtenerConfiguracion())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const guardarConfiguracion = useCallback(async (cambios) => {
    const actualizada = await actualizarConfiguracion(cambios)
    setConfig(actualizada)
    return actualizada
  }, [])

  const valor = useMemo(
    () => ({ config, cargando, error, recargar, guardarConfiguracion }),
    [config, cargando, error, recargar, guardarConfiguracion],
  )

  return <ConfiguracionContext.Provider value={valor}>{children}</ConfiguracionContext.Provider>
}

export default ConfiguracionProvider