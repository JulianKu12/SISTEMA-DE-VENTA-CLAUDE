import assert from 'node:assert/strict'
import test from 'node:test'
import bcrypt from 'bcrypt'
import app from '../src/app.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'
import prisma from '../src/models/prisma.js'
import { cargarConfiguracion } from '../src/config/env.js'

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

test('GET /api/health responde ok', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })
})

test('request ID y logs HTTP omiten query, autorización y cuerpo', async () => {
  const registros = []
  const originalLog = console.log
  console.log = (linea) => registros.push(linea)
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health?token=secreto-query`, {
        headers: { Authorization: 'Bearer secreto-header' },
      })
      const requestId = response.headers.get('x-request-id')
      assert.match(requestId, /^[0-9a-f-]{36}$/i)
      assert.equal(response.status, 200)
      await response.arrayBuffer()
    })
  } finally {
    console.log = originalLog
  }

  const log = JSON.parse(registros.at(-1))
  assert.equal(log.event, 'http.request.completed')
  assert.equal(log.requestId.length, 36)
  assert.equal(log.path, '/api/health')
  assert.equal(log.statusCode, 200)
  assert.equal(typeof log.durationMs, 'number')
  assert.doesNotMatch(registros.join('\n'), /secreto-query|secreto-header/)
})

test('GET /api/health/ready verifica disponibilidad de la base de datos', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health/ready`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ready', database: 'ok' })
  })
})

test('configuración de producción requiere secreto, CORS y límites seguros', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'file:./pos.db',
    JWT_SECRET: '9a'.repeat(48),
    CORS_ORIGIN: 'https://pos.example.com',
  }
  const config = cargarConfiguracion(production)
  assert.equal(config.nodeEnv, 'production')
  assert.deepEqual(config.corsOrigins, ['https://pos.example.com'])
  assert.equal(config.rateLimitLoginMax, 5)
  assert.equal(config.rateLimitGeneralMax, 100)

  assert.throws(
    () => cargarConfiguracion({ ...production, CORS_ORIGIN: undefined }),
    /CORS_ORIGIN es obligatorio en producción/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, CORS_ORIGIN: '*' }),
    /no puede incluir "\*" en producción/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, JWT_SECRET: 'cambia-este-valor-por-un-secreto-largo' }),
    /JWT_SECRET en producción/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, DATABASE_URL: 'file:./dev.db' }),
    /no puede apuntar a dev.db ni test.db/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, RATE_LIMIT_LOGIN_MAX: '0' }),
    /RATE_LIMIT_LOGIN_MAX debe estar entre 1 y 20/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, RATE_LIMIT_GENERAL_MAX: '' }),
    /RATE_LIMIT_GENERAL_MAX debe ser un entero positivo/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, RATE_LIMIT_GENERAL_MAX: '1001' }),
    /RATE_LIMIT_GENERAL_MAX debe estar entre 1 y 1000/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, PORT: '70000' }),
    /PORT debe estar entre 1 y 65535/,
  )
  assert.throws(
    () => cargarConfiguracion({ ...production, CORS_ORIGIN: 'https://pos.example.com/app' }),
    /CORS_ORIGIN debe contener orígenes HTTP\(S\) sin rutas/,
  )
})

test('POST /api/auth/login requiere usuario y contraseña', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: 'admin' }),
    })

    assert.equal(response.status, 400)
    const payload = await response.json()
    assert.match(payload.message, /usuario y contraseña son obligatorios/i)
  })
})

test('POST /api/auth/login rechaza cuerpo JSON nulo o inválido', async () => {
  await withServer(async (baseUrl) => {
    const nullBodyResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    })
    assert.equal(nullBodyResponse.status, 400)

    const malformedResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    assert.equal(malformedResponse.status, 400)
    assert.deepEqual(await malformedResponse.json(), {
      message: 'El cuerpo de la petición no es JSON válido',
    })
  })
})

test('errorHandler no expone mensajes de errores internos', () => {
  let status
  let body
  const response = {
    status(code) {
      status = code
      return this
    },
    json(payload) {
      body = payload
      return this
    },
  }
  const next = (error) => {
    throw error
  }
  const registros = []
  const originalError = console.error
  console.error = (linea) => registros.push(linea)
  try {
    const error = new Error('detalle interno sensible')
    error.faltantes = [{ ingredienteId: 1 }]
    error.nuevoTotal = 99
    errorHandler(error, { method: 'GET', path: '/api/test', requestId: 'request-test' }, response, next)
  } finally {
    console.error = originalError
  }

  assert.equal(status, 500)
  assert.deepEqual(body, { message: 'Error interno del servidor' })
  const log = JSON.parse(registros[0])
  assert.equal(log.event, 'http.request.failed')
  assert.equal(log.requestId, 'request-test')
  assert.equal(log.errorName, 'Error')
  assert.equal('stack' in log, false)
  assert.doesNotMatch(registros[0], /detalle interno sensible/)
})

test('POST /api/auth/login acepta credenciales válidas', async () => {
  const usuarioPrueba = 'admin-test-smoke'
  const contraseña = 'SuperSecreto123!'

  const hash = await bcrypt.hash(contraseña, 10)

  await prisma.usuario.upsert({
    where: { usuario: usuarioPrueba },
    update: { contraseña: hash, tipo: 'Administrador' },
    create: {
      usuario: usuarioPrueba,
      contraseña: hash,
      tipo: 'Administrador',
      nombre: 'Usuario prueba',
    },
  })

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuarioPrueba, contraseña }),
    })

    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.usuario.usuario, usuarioPrueba)
    assert.equal(payload.usuario.tipo, 'Administrador')
    assert.ok(payload.token)
  })
})

test('flujos críticos de caja, inventario, ventas y pedidos son consistentes', async () => {
  const usuario = `admin-flujos-${Date.now()}`
  const contraseña = 'PruebaIntegracion123!'
  const hash = await bcrypt.hash(contraseña, 10)
  await prisma.usuario.create({
    data: { usuario, contraseña: hash, tipo: 'Administrador', nombre: 'Admin integración' },
  })

  const ingrediente = await prisma.ingrediente.create({
    data: {
      nombre: `Ingrediente integración ${Date.now()}`,
      unidadMedida: 'pieza',
      stockActual: 0,
      stockMinimoAlerta: 0,
    },
  })
  const producto = await prisma.producto.create({
    data: {
      nombre: `Producto integración ${Date.now()}`,
      precio: 15,
      tipo: 'Con_receta',
      productoIngredientes: {
        create: { ingredienteId: ingrediente.id, cantidad: 1 },
      },
    },
  })

  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contraseña }),
    })
    assert.equal(loginResponse.status, 200)
    const { token } = await loginResponse.json()
    const request = (path, body, method = 'POST') =>
      fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })

    const ingredienteInvalido = await request('/api/ingredientes', {
      nombre: 'Ingrediente con stock negativo',
      unidadMedida: 'pieza',
      stockActual: -1,
      stockMinimoAlerta: 0,
    })
    assert.equal(ingredienteInvalido.status, 400)
    const costoIngredienteInvalido = await request('/api/ingredientes', {
      nombre: 'Ingrediente con costo negativo',
      unidadMedida: 'pieza',
      stockActual: 1,
      stockMinimoAlerta: 0,
      costoUltimaCompra: -1,
    })
    assert.equal(costoIngredienteInvalido.status, 400)
    assert.equal(
      await prisma.ingrediente.count({
        where: { nombre: { in: ['Ingrediente con stock negativo', 'Ingrediente con costo negativo'] } },
      }),
      0,
    )
    assert.equal((await request(`/api/ingredientes/${ingrediente.id}`, { stockMinimoAlerta: -1 }, 'PATCH')).status, 400)
    assert.equal((await request(`/api/ingredientes/${ingrediente.id}`, { costoUltimaCompra: -1 }, 'PATCH')).status, 400)

    const precioProductoInvalido = await request('/api/productos', {
      nombre: 'Producto con precio negativo',
      precio: -1,
      tipo: 'Con_receta',
      ingredientes: [{ ingredienteId: ingrediente.id, cantidad: 1 }],
    })
    assert.equal(precioProductoInvalido.status, 400)
    const recetaInvalida = await request('/api/productos', {
      nombre: 'Producto con receta negativa',
      precio: 10,
      tipo: 'Con_receta',
      ingredientes: [{ ingredienteId: ingrediente.id, cantidad: -1 }],
    })
    assert.equal(recetaInvalida.status, 400)
    const recetaEnCero = await request('/api/productos', {
      nombre: 'Producto con receta en cero',
      precio: 10,
      tipo: 'Con_receta',
      ingredientes: [{ ingredienteId: ingrediente.id, cantidad: 0 }],
    })
    assert.equal(recetaEnCero.status, 400)
    assert.equal(
      await prisma.producto.count({
        where: {
          nombre: {
            in: [
              'Producto con precio negativo',
              'Producto con receta negativa',
              'Producto con receta en cero',
            ],
          },
        },
      }),
      0,
    )
    assert.equal(
      (await request('/api/productos/' + producto.id, { precio: -1 }, 'PATCH')).status,
      400,
    )

    const modificadorConCantidadNegativa = await request('/api/modificadores', {
      nombre: 'Modificador con cantidad negativa',
      tipo: 'Agregar',
      ingredienteAfectadoId: ingrediente.id,
      cantidadExtra: -1,
    })
    assert.equal(modificadorConCantidadNegativa.status, 400)
    const modificadorConCostoNegativo = await request('/api/modificadores', {
      nombre: 'Modificador con costo negativo',
      tipo: 'Agregar',
      ingredienteAfectadoId: ingrediente.id,
      cantidadExtra: 1,
      costoAdicional: -1,
    })
    assert.equal(modificadorConCostoNegativo.status, 400)
    assert.equal(await prisma.modificador.count(), 0)
    const ingredienteAlterno = await prisma.ingrediente.create({
      data: {
        nombre: `Ingrediente alterno ${Date.now()}`,
        unidadMedida: 'pieza',
        stockActual: 0,
        stockMinimoAlerta: 0,
      },
    })
    const productoAlterno = await prisma.producto.create({
      data: {
        nombre: `Producto alterno ${Date.now()}`,
        precio: 20,
        tipo: 'Con_receta',
        productoIngredientes: {
          create: { ingredienteId: ingrediente.id, cantidad: 1 },
        },
      },
    })
    const productoIncompatible = await prisma.producto.create({
      data: {
        nombre: `Producto incompatible ${Date.now()}`,
        precio: 20,
        tipo: 'Con_receta',
        productoIngredientes: {
          create: { ingredienteId: ingredienteAlterno.id, cantidad: 1 },
        },
      },
    })
    const modificadorValido = await request('/api/modificadores', {
      nombre: 'Modificador integración',
      tipo: 'Agregar',
      ingredienteAfectadoId: ingrediente.id,
      cantidadExtra: 1,
      productoIds: [producto.id],
    })
    assert.equal(modificadorValido.status, 201)
    const modificadorCreado = await modificadorValido.json()
    const modificadorActualizado = await request(
      `/api/modificadores/${modificadorCreado.id}`,
      {
        nombre: 'Modificador integración actualizado',
        cantidadExtra: 2,
        productoIds: [productoAlterno.id],
      },
      'PATCH',
    )
    assert.equal(modificadorActualizado.status, 200)
    const modificadorActualizadoDatos = await modificadorActualizado.json()
    assert.equal(modificadorActualizadoDatos.nombre, 'Modificador integración actualizado')
    assert.equal(modificadorActualizadoDatos.cantidadExtra, 2)
    assert.deepEqual(
      modificadorActualizadoDatos.productoModificadores.map((pm) => pm.productoId),
      [productoAlterno.id],
    )

    const edicionInvalida = await request(
      `/api/modificadores/${modificadorCreado.id}`,
      {
        nombre: 'Este cambio debe revertirse',
        cantidadExtra: 3,
        productoIds: [productoAlterno.id, productoIncompatible.id],
      },
      'PATCH',
    )
    assert.equal(edicionInvalida.status, 400)
    const estadoTrasError = await prisma.modificador.findUnique({
      where: { id: modificadorCreado.id },
      include: { productoModificadores: true },
    })
    assert.equal(estadoTrasError.nombre, 'Modificador integración actualizado')
    assert.equal(estadoTrasError.cantidadExtra, 2)
    assert.deepEqual(
      estadoTrasError.productoModificadores.map((pm) => pm.productoId),
      [productoAlterno.id],
    )

    const comboConPrecioNegativo = await request('/api/combos', {
      nombre: 'Combo con precio negativo',
      precioEspecial: -1,
      productos: [{ productoId: producto.id }],
    })
    assert.equal(comboConPrecioNegativo.status, 400)
    assert.equal(await prisma.combo.count(), 0)

    const aperturaInvalida = await request('/api/caja/abrir', { fondoInicial: -1 })
    assert.equal(aperturaInvalida.status, 400)
    assert.equal(await prisma.dia_Operativo.count(), 0)

    const apertura = await request('/api/caja/abrir', { fondoInicial: 100 })
    assert.equal(apertura.status, 201)
    const caja = (await apertura.json()).diaOperativo
    const aperturaDuplicada = await request('/api/caja/abrir', { fondoInicial: 0 })
    assert.equal(aperturaDuplicada.status, 409)
    assert.equal(await prisma.dia_Operativo.count(), 1)

    const entrada = await request('/api/inventario/entrada', {
      ingredienteId: ingrediente.id,
      cantidad: 10,
    })
    assert.equal(entrada.status, 201)
    assert.equal((await entrada.json()).stockActual, 10)

    const entradaConCantidadInvalida = await request('/api/inventario/entrada', {
      ingredienteId: ingrediente.id,
      cantidad: -1,
    })
    assert.equal(entradaConCantidadInvalida.status, 400)
    const entradaConCostoInvalido = await request('/api/inventario/entrada', {
      ingredienteId: ingrediente.id,
      cantidad: 1,
      costo: -1,
    })
    assert.equal(entradaConCostoInvalido.status, 400)
    assert.equal(
      await prisma.movimiento_Inventario.count({
        where: { ingredienteId: ingrediente.id, tipoMovimiento: 'Entrada' },
      }),
      1,
      'la entrada inválida debe revertir también su movimiento',
    )
    assert.equal(await prisma.gasto.count(), 0)

    const ventaCantidadInvalida = await request('/api/ventas', {
      productos: [{ productoId: producto.id, cantidad: 0 }],
      metodoPago: 'Efectivo',
    })
    assert.equal(ventaCantidadInvalida.status, 400)
    assert.equal(await prisma.venta.count(), 0)

    const ventaSinStock = await request('/api/ventas', {
      productos: [{ productoId: producto.id, cantidad: 11 }],
      metodoPago: 'Efectivo',
    })
    assert.equal(ventaSinStock.status, 409)
    assert.equal(await prisma.venta.count(), 0)
    assert.equal(await prisma.ingrediente.findUnique({ where: { id: ingrediente.id } }).then((i) => i.stockActual), 10)

    const venta = await request('/api/ventas', {
      productos: [{ productoId: producto.id, cantidad: 2, precioCongelado: 0 }],
      metodoPago: 'Efectivo',
    })
    assert.equal(venta.status, 201)
    const ventaCreada = (await venta.json()).venta
    assert.equal(ventaCreada.total, 30, 'el precio enviado por el cliente no debe alterar el total')
    assert.equal(ventaCreada.diaOperativoId, caja.id)

    const pedidoInvalido = await request('/api/pedidos', {
      tipo: 'No_valido',
      origen: 'Mostrador',
      productos: [{ productoId: producto.id, cantidad: 1 }],
    })
    assert.equal(pedidoInvalido.status, 400)
    assert.equal(await prisma.pedido.count(), 0)

    const pedidoResponse = await request('/api/pedidos', {
      tipo: 'Para_recoger',
      origen: 'Mostrador',
      productos: [{ productoId: producto.id, cantidad: 1 }],
      metodoPago: 'Efectivo',
      montoReferenciaPago: 15,
    })
    assert.equal(pedidoResponse.status, 201)
    const pedido = await pedidoResponse.json()
    assert.equal(pedido.estadoPago, 'Pagado')
    assert.ok(pedido.ventaId, 'el pedido pagado en mostrador genera una venta')

    const salidas = await prisma.movimiento_Inventario.findMany({
      where: { ingredienteId: ingrediente.id, tipoMovimiento: 'Salida_venta' },
    })
    assert.equal(salidas.length, 2, 'pedido y venta deben generar un movimiento cada uno')
    assert.equal(salidas.reduce((total, movimiento) => total + movimiento.cantidad, 0), -3)
    assert.equal(
      await prisma.ingrediente.findUnique({ where: { id: ingrediente.id } }).then((i) => i.stockActual),
      7,
    )

    const gasto = await request('/api/gastos', {
      concepto: 'Gasto de prueba integración',
      monto: 5,
      categoria: 'Otro',
      metodoPago: 'Efectivo',
    })
    assert.equal(gasto.status, 201)

    const cierreInvalido = await request('/api/caja/cerrar', { efectivoContado: 'no es número' })
    assert.equal(cierreInvalido.status, 400)
    assert.equal((await prisma.dia_Operativo.findUnique({ where: { id: caja.id } })).estado, 'Abierto')

    const cierre = await request('/api/caja/cerrar', { efectivoContado: 140 })
    assert.equal(cierre.status, 200)
    const resumen = (await cierre.json()).cierre
    assert.equal(resumen.efectivoEsperado, 140)
    assert.equal(resumen.diferencia, 0)
  })
})
