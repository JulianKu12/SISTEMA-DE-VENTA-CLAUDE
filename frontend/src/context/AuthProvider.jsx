import { useCallback, useMemo, useState } from 'react'
import { iniciarSesion } from '../services/auth'
import { AuthContext } from './authContext'

const TOKEN_KEY = 'pos.token'
const USUARIO_KEY = 'pos.usuario'

function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [usuario, setUsuario] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USUARIO_KEY))
    } catch {
      return null
    }
  })

  const login = useCallback(async ({ usuario: nombreUsuario, contraseña }) => {
    const datos = await iniciarSesion({ usuario: nombreUsuario, contraseña })
    localStorage.setItem(TOKEN_KEY, datos.token)
    localStorage.setItem(USUARIO_KEY, JSON.stringify(datos.usuario))
    setToken(datos.token)
    setUsuario(datos.usuario)
    return datos
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USUARIO_KEY)
    setToken(null)
    setUsuario(null)
  }, [])

  const valor = useMemo(
    () => ({ token, usuario, login, logout }),
    [token, usuario, login, logout],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export default AuthProvider
