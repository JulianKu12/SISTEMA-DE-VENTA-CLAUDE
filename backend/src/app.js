import express from 'express'
import cors from 'cors'
import apiRoutes from './routes/index.js'
import authRoutes from './routes/auth.routes.js'
import { autenticar } from './middlewares/auth.middleware.js'
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js'

const app = express()

app.use(cors())
app.use(express.json())

// Login público; el resto del /api exige token (excepto /api/health).
app.use('/api/auth', authRoutes)
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next()
  return autenticar(req, res, next)
})
app.use('/api', apiRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
