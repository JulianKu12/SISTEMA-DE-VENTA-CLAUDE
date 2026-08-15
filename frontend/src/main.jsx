import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AuthProvider from './context/AuthProvider.jsx'
import ConfiguracionProvider from './context/ConfiguracionProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConfiguracionProvider>
          <App />
        </ConfiguracionProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
