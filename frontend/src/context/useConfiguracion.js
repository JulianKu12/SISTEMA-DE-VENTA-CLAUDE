import { useContext } from 'react'
import { ConfiguracionContext } from './configuracionContext'

export function useConfiguracion() {
  const contexto = useContext(ConfiguracionContext)
  if (!contexto) {
    throw new Error('useConfiguracion debe usarse dentro de <ConfiguracionProvider>')
  }
  return contexto
}