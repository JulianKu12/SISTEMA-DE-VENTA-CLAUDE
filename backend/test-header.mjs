import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient({ datasources: { db: { url: 'file:./sec_test.db' } } })
const BASE = 'http://localhost:3001'
let fallas = 0
let token = null

function ok(cond, nombre, res = null) {
  if (cond) console.log(`  OK  ${nombre}`)
  else {
    fallas++
    const extra = res ? ` | status: ${res.status} | body: ${JSON.stringify(res.data)}` : ''
    console.log(`FALLA ${nombre}${extra}`)
  }
}