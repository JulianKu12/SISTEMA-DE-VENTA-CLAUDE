import { Router } from 'express'
import { login, logout } from '../controllers/auth.controller.js'
import { autenticar } from '../middlewares/auth.middleware.js'

const router = Router()

router.post('/login', login)
router.post('/logout', autenticar, logout)

export default router
