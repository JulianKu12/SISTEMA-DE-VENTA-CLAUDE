import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcrypt'
import app from '../src/app.js'
import prisma from '../src/models/prisma.js'
import {
  repartidorNoCobrarPedido,
  repartidorNoCobrarVenta,
  repartidorSoloSusPedidos,
} from '../src/middlewares/authz.middleware.js'

async function withServer(callback) {
  const server = app.listen(0)
  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo obtener el puerto del servidor de pruebas')
    }
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

async function crearRepartidorAutenticado(baseUrl) {
  const sufijo = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const usuario = `repartidor-authz-${sufijo}`
  const contraseña = 'PruebaAuthzSegura123!'
  const hash = await bcrypt.hash(contraseña, 4)
  const cuenta = await prisma.usuario.create({
    data: {
      tipo: 'Repartidor',
      nombre: 'Repartidor de prueba',
      usuario,
      contraseña: hash,
      empleado: {
        create: { nombre: 'Repartidor de prueba' },
      },
    },
    include: { empleado: true },
  })
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, contraseña }),
  })
  assert.equal(login.status, 200)
  const { token } = await login.json()
  return { token, empleadoId: cuenta.empleado.id }
}

const rutasAdministrativas = [
  ['GET', '/api/ingredientes'],
  ['GET', '/api/ingredientes/1'],
  ['POST', '/api/ingredientes'],
  ['PATCH', '/api/ingredientes/1'],
  ['PATCH', '/api/ingredientes/1/desactivar'],
  ['PATCH', '/api/ingredientes/1/reactivar'],
  ['DELETE', '/api/ingredientes/1'],
  ['GET', '/api/productos'],
  ['GET', '/api/productos/1'],
  ['POST', '/api/productos'],
  ['PATCH', '/api/productos/1'],
  ['PATCH', '/api/productos/1/disponibilidad'],
  ['PATCH', '/api/productos/1/desactivar'],
  ['PATCH', '/api/productos/1/reactivar'],
  ['DELETE', '/api/productos/1'],
  ['POST', '/api/productos/1/modificadores'],
  ['DELETE', '/api/productos/1/modificadores/1'],
  ['GET', '/api/modificadores'],
  ['GET', '/api/modificadores/1'],
  ['POST', '/api/modificadores'],
  ['PATCH', '/api/modificadores/1'],
  ['PATCH', '/api/modificadores/1/desactivar'],
  ['PATCH', '/api/modificadores/1/reactivar'],
  ['DELETE', '/api/modificadores/1'],
  ['GET', '/api/combos'],
  ['GET', '/api/combos/1'],
  ['POST', '/api/combos'],
  ['PATCH', '/api/combos/1'],
  ['PATCH', '/api/combos/1/desactivar'],
  ['PATCH', '/api/combos/1/reactivar'],
  ['DELETE', '/api/combos/1'],
  ['GET', '/api/ventas'],
  ['GET', '/api/ventas/no-cobrar'],
  ['GET', '/api/ventas/1'],
  ['GET', '/api/inventario/stock'],
  ['POST', '/api/inventario/entrada'],
  ['POST', '/api/inventario/ajuste'],
  ['GET', '/api/caja/estado'],
  ['GET', '/api/caja/historial'],
  ['POST', '/api/caja/abrir'],
  ['POST', '/api/caja/cerrar'],
  ['POST', '/api/caja/completar-corte'],
  ['GET', '/api/gastos'],
  ['POST', '/api/gastos'],
  ['GET', '/api/ingresos-manuales'],
  ['POST', '/api/ingresos-manuales'],
  ['GET', '/api/devoluciones'],
  ['POST', '/api/devoluciones'],
  ['GET', '/api/clientes'],
  ['GET', '/api/clientes/1'],
  ['POST', '/api/clientes'],
  ['PATCH', '/api/clientes/1'],
  ['DELETE', '/api/clientes/1'],
  ['GET', '/api/clientes/1/referencias'],
  ['POST', '/api/clientes/1/referencias'],
  ['PATCH', '/api/clientes/referencias/1'],
  ['DELETE', '/api/clientes/referencias/1'],
  ['GET', '/api/empleados'],
  ['GET', '/api/empleados/1'],
  ['POST', '/api/empleados'],
  ['PATCH', '/api/empleados/1'],
  ['DELETE', '/api/empleados/1'],
  ['GET', '/api/config'],
  ['PATCH', '/api/config'],
  ['GET', '/api/config/costo-envio'],
  ['PATCH', '/api/config/costo-envio'],
  ['GET', '/api/config/repartidor-unico'],
  ['PATCH', '/api/config/repartidor-unico'],
  ['GET', '/api/configuracion'],
  ['PATCH', '/api/configuracion'],
  ['GET', '/api/configuracion/costo-envio'],
  ['PATCH', '/api/configuracion/costo-envio'],
  ['GET', '/api/configuracion/repartidor-unico'],
  ['PATCH', '/api/configuracion/repartidor-unico'],
  ['GET', '/api/pedidos'],
  ['GET', '/api/pedidos/1/detalle'],
  ['PATCH', '/api/pedidos/1'],
]

const rutasProtegidas = [
  ...rutasAdministrativas,
  ['POST', '/api/ventas'],
  ['POST', '/api/pedidos'],
  ['PATCH', '/api/pedidos/1/estado-pago'],
  ['GET', '/api/pedidos/repartidor/1'],
  ['PATCH', '/api/pedidos/1/estado-preparacion'],
]

test('las rutas administrativas devuelven 403 a Repartidor en todos los módulos', async () => {
  await withServer(async (baseUrl) => {
    const { token } = await crearRepartidorAutenticado(baseUrl)
    for (const [method, route] of rutasAdministrativas) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(method === 'GET' || method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(method === 'GET' || method === 'DELETE' ? {} : { body: '{}' }),
      })
      assert.equal(response.status, 403, `${method} ${route} debe requerir Administrador`)
    }
  })
})

test('los endpoints limitados a Repartidor rechazan roles desconocidos por defecto', async () => {
  const nextError = (req, middleware) =>
    new Promise((resolve) => middleware(req, null, (error) => resolve(error)))
  const usuarioDesconocido = { tipo: 'Otro', empleado: { id: 10 } }

  const errorVenta = await nextError(
    { usuario: usuarioDesconocido, body: { noCobrar: true } },
    repartidorNoCobrarVenta,
  )
  const errorPedido = await nextError(
    { usuario: usuarioDesconocido, body: { tipo: 'A_domicilio', noCobrar: true } },
    repartidorNoCobrarPedido,
  )
  const errorPedidosPropios = await nextError(
    { usuario: usuarioDesconocido, params: { repartidorId: '10' } },
    repartidorSoloSusPedidos,
  )

  assert.equal(errorVenta.status, 403)
  assert.equal(errorPedido.status, 403)
  assert.equal(errorPedidosPropios.status, 403)
})

test('las rutas protegidas requieren sesión y el health check permanece público', async () => {
  await withServer(async (baseUrl) => {
    for (const [method, route] of rutasProtegidas) {
      const response = await fetch(`${baseUrl}${route}`, {
        method,
        ...(method === 'GET' || method === 'DELETE'
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      })
      assert.equal(response.status, 401, `${method} ${route} debe rechazar solicitudes sin sesión`)
    }

    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' })
    assert.equal(logout.status, 401, 'logout debe requerir sesión')

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(login.status, 400, 'login debe permanecer público y validar su cuerpo')

    const salud = await fetch(`${baseUrl}/api/health`)
    assert.equal(salud.status, 200)
    const readiness = await fetch(`${baseUrl}/api/health/ready`)
    assert.equal(readiness.status, 200)
  })
})

test('Repartidor solo puede consultar sus propios pedidos', async () => {
  await withServer(async (baseUrl) => {
    const { token, empleadoId } = await crearRepartidorAutenticado(baseUrl)
    const propia = await fetch(`${baseUrl}/api/pedidos/repartidor/${empleadoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(propia.status, 200)

    const ajena = await fetch(`${baseUrl}/api/pedidos/repartidor/${empleadoId + 1}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(ajena.status, 403)
  })
})
