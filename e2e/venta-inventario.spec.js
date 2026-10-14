import { expect, test } from '@playwright/test'

async function iniciarSesion(page, usuario = 'e2e-admin', contraseña = 'e2e-test-password') {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario)
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contraseña)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/')
}

async function configurarProductoConReceta(
  page,
  nombreProducto,
  cantidad,
  {
    ingrediente = 'Ingrediente E2E (pieza)',
    permiteMitadYMitad = false,
    precio = 40,
  } = {},
) {
  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'Productos', exact: true }).click()
  await page.getByRole('button', { name: /Nuevo producto/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible()
  await dialog.getByLabel('Nombre', { exact: true }).fill(nombreProducto)
  await dialog.getByLabel('Precio', { exact: true }).fill(String(precio))
  await dialog.locator('select').first().selectOption({ label: ingrediente })
  await dialog.getByPlaceholder('0', { exact: true }).fill(String(cantidad))
  if (permiteMitadYMitad) await dialog.getByLabel('Permite mitad y mitad').check()
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(nombreProducto, { exact: true })).toBeVisible()
}

async function configurarModificadorAgregar(page, nombreProducto, nombreModificador) {
  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'Modificadores', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo modificador', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre', { exact: true }).fill(nombreModificador)
  await dialog.locator('#mod-afectado').selectOption({ label: 'Ingrediente flujos E2E (pieza)' })
  await dialog.getByLabel('Cantidad extra').fill('1')
  await dialog.getByLabel('Costo adicional $').fill('5')
  await dialog.getByRole('checkbox', { name: nombreProducto }).check()
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(nombreModificador, { exact: true })).toBeVisible()
}

async function configurarCombo(page, nombreCombo, productos, precio) {
  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'Combos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo combo', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre', { exact: true }).fill(nombreCombo)
  await dialog.getByLabel('Precio especial').fill(String(precio))
  const selectores = dialog.locator('select')
  await selectores.nth(0).selectOption({ label: productos[0] })
  for (const [index, nombreProducto] of productos.slice(1).entries()) {
    await dialog.getByRole('button', { name: 'Agregar producto', exact: true }).click()
    await selectores.nth(index + 1).selectOption({ label: nombreProducto })
  }
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(nombreCombo, { exact: true })).toBeVisible()
}

async function iniciarPedidoParaRecoger(page, nombreProducto) {
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Cliente de mostrador').fill('Cliente de prueba E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^Agregar ·/ }).click()
  await page.getByRole('button', { name: '$50.00', exact: true }).click()
}

async function configurarProductoReventa(page, nombreProducto) {
  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'Productos', exact: true }).click()
  await page.getByRole('button', { name: /Nuevo producto/ }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nombre', { exact: true }).fill(nombreProducto)
  await dialog.getByLabel('Precio', { exact: true }).fill('40')
  await dialog.getByRole('button', { name: 'Reventa directa', exact: true }).click()
  await dialog.getByLabel('Stock inicial (opcional)').fill('5')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog).toBeHidden()
}

test('configura un producto, crea un pedido y descuenta su receta del inventario', async ({
  page,
}) => {
  const nombreProducto = `Hamburguesa E2E ${Date.now()}`

  await iniciarSesion(page)
  await configurarProductoConReceta(page, nombreProducto, 2)
  await iniciarPedidoParaRecoger(page, nombreProducto)
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page.getByRole('heading', { name: /Pedido #\d+ creado/ })).toBeVisible()

  await page.goto('/inventario')
  const ingrediente = page.locator('li').filter({ hasText: 'Ingrediente E2E' })
  await expect(ingrediente).toContainText('8 pieza')
})

test('advierte sobre stock insuficiente y solo descuenta al confirmar usar lo disponible', async ({
  page,
}) => {
  const nombreProducto = `Receta sin stock E2E ${Date.now()}`

  await iniciarSesion(page)
  await configurarProductoConReceta(page, nombreProducto, 12)
  await iniciarPedidoParaRecoger(page, nombreProducto)
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  await expect(page.getByText('Stock insuficiente', { exact: true })).toBeVisible()
  await expect(page.getByText('Ingrediente E2E: requerido 12 · disponible 8')).toBeVisible()

  await page.goto('/inventario')
  const ingrediente = page.locator('li').filter({ hasText: 'Ingrediente E2E' })
  await expect(ingrediente).toContainText('8 pieza')

  await iniciarPedidoParaRecoger(page, nombreProducto)
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page.getByText('Stock insuficiente', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Usar lo disponible' }).click()
  await expect(page.getByRole('heading', { name: /Pedido #\d+ creado/ })).toBeVisible()

  await page.goto('/inventario')
  await expect(ingrediente).toContainText('0 pieza')
})

test('cobra un pedido telefónico con transferencia y refleja el efectivo correcto al cerrar caja', async ({
  page,
}) => {
  const nombreProducto = `Producto transferencia E2E ${Date.now()}`

  await iniciarSesion(page)
  await configurarProductoReventa(page, nombreProducto)

  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
  await page.getByRole('button', { name: 'Por teléfono', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Cliente de mostrador').fill('Cliente transferencia E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await page.getByRole('button', { name: 'Transferencia', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezadoPedido = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezadoPedido).toBeVisible()
  await expect(page.getByText(/Pago pendiente/)).toBeVisible()
  const textoPedido = await encabezadoPedido.textContent()
  const pedidoId = textoPedido.match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()

  await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
  await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
  await page.getByRole('button', { name: 'Pasar a En preparación', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Marcar Entregado', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Marcar Entregado', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Marcar Pagado', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Marcar Pagado', exact: true }).click()
  await expect(page.getByText('Pedido pagado. Venta generada.', { exact: true }).last()).toBeVisible()

  await page.goto('/caja')
  await expect(page.getByText('Caja abierta')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Efectivo contado').fill('180')
  await dialog.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Caja cerrada' })).toBeVisible()
  const resumenCierre = page.getByRole('dialog')
  await expect(
    resumenCierre.getByText('Efectivo esperado', { exact: true }).locator('..').getByText('$180.00', { exact: true }),
  ).toBeVisible()
  await expect(
    resumenCierre.getByText('Ventas en efectivo', { exact: true }).locator('..').getByText('$80.00', { exact: true }),
  ).toBeVisible()
  await expect(
    resumenCierre.getByText('Ventas por transferencia', { exact: true }).locator('..').getByText('$40.00', { exact: true }),
  ).toBeVisible()
  await expect(resumenCierre.getByText('Cuadra exacto', { exact: true })).toBeVisible()
})

test('las pantallas administrativas principales cargan sin errores de interfaz', async ({ page }) => {
  const erroresPagina = []
  page.on('pageerror', (error) => erroresPagina.push(error.message))

  const nombreProducto = `Producto pantallas E2E ${Date.now()}`
  await iniciarSesion(page)
  await page.goto('/caja')
  await page.getByLabel('Fondo inicial').fill('100')
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  const modalApertura = page.getByRole('dialog')
  await modalApertura.getByRole('button', { name: 'No, abrir de inmediato' }).click()
  await modalApertura.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await expect(page.getByText('Caja abierta')).toBeVisible()

  await configurarProductoReventa(page, nombreProducto)

  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
  await page.getByRole('button', { name: 'Por teléfono', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Cliente de mostrador').fill('Cliente pantallas E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await page.getByRole('button', { name: 'Transferencia', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezadoPedido = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezadoPedido).toBeVisible()
  const pedidoId = (await encabezadoPedido.textContent()).match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()

  const pantallas = [
    ['/', 'button', /Nuevo Pedido/],
    ['/pedidos/nuevo', 'heading', 'Nuevo Pedido'],
    [`/pedidos/${pedidoId}`, 'heading', new RegExp(`Pedido #${pedidoId}`)],
    ['/configuracion', 'heading', 'Configuración de menú'],
    ['/inventario', 'heading', 'Inventario'],
    ['/clientes', 'heading', 'Clientes'],
    ['/repartidores', 'heading', 'Repartidores'],
    ['/caja', 'heading', 'Caja'],
    ['/gastos', 'heading', 'Caja'],
    ['/reportes', 'heading', 'Reportes'],
  ]

  for (const [ruta, tipo, nombre] of pantallas) {
    await page.goto(ruta)
    await expect(page.getByRole(tipo, { name: nombre, exact: typeof nombre === 'string' })).toBeVisible()
  }

  await page.goto('/configuracion')
  for (const pestana of ['General', 'Ingredientes', 'Productos', 'Modificadores', 'Combos']) {
    const boton = page.getByRole('button', { name: pestana, exact: true })
    await boton.click()
    await expect(boton).toHaveAttribute('aria-pressed', 'true')
  }

  await page.goto('/gastos')
  const pestanaGastos = page.getByRole('button', { name: 'Gastos', exact: true })
  await expect(pestanaGastos).toHaveAttribute('aria-pressed', 'true')
  const pestanaIngresos = page.getByRole('button', { name: 'Ingresos', exact: true })
  await pestanaIngresos.click()
  await expect(pestanaIngresos).toHaveAttribute('aria-pressed', 'true')

  expect(erroresPagina).toEqual([])
})

test('Repartidor ve solo su pantalla de entregas y no puede abrir inventario', async ({ page }) => {
  await iniciarSesion(page, 'e2e-repartidor', 'e2e-courier-password')
  await page.goto('/inventario')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  await expect(page.getByText('Aún no tienes pedidos asignados.')).toBeVisible()
})

test('no permite que un tipo de usuario desconocido abra rutas administrativas', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pos.token', 'token-e2e-invalido')
    localStorage.setItem('pos.usuario', JSON.stringify({ tipo: 'Otro' }))
  })

  await page.goto('/inventario')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Acceso no autorizado' })).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL('/login')
})

test('personaliza una mitad y mitad y un combo con modificadores y valida sus precios', async ({
  page,
}) => {
  const sufijo = Date.now()
  const saborUno = `Sabor E2E uno ${sufijo}`
  const saborDos = `Sabor E2E dos ${sufijo}`
  const modificador = `Extra E2E ${sufijo}`
  const combo = `Combo E2E ${sufijo}`

  await iniciarSesion(page)
  await configurarProductoConReceta(page, saborUno, 1, {
    ingrediente: 'Ingrediente flujos E2E (pieza)',
    permiteMitadYMitad: true,
  })
  await configurarProductoConReceta(page, saborDos, 1, {
    ingrediente: 'Ingrediente flujos E2E (pieza)',
    permiteMitadYMitad: true,
    precio: 60,
  })
  await configurarModificadorAgregar(page, saborUno, modificador)
  await configurarCombo(page, combo, [saborUno, saborDos], 80)

  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Cliente de mostrador').fill('Cliente combos E2E')

  await page.getByRole('button', { name: new RegExp(saborUno) }).click()
  const dialogMitad = page.getByRole('dialog')
  await dialogMitad.getByRole('button', { name: 'Mitad y mitad', exact: true }).click()
  await dialogMitad.getByLabel('Sabor 2').selectOption({ label: saborDos })
  await dialogMitad.getByRole('checkbox', { name: modificador }).check()
  await expect(dialogMitad.getByRole('button', { name: 'Agregar · $55.00' })).toBeEnabled()
  await dialogMitad.getByRole('button', { name: 'Agregar · $55.00' }).click()

  await page.getByRole('button', { name: new RegExp(combo) }).click()
  const dialogCombo = page.getByRole('dialog')
  await dialogCombo.getByRole('checkbox', { name: modificador }).check()
  await expect(dialogCombo.getByRole('button', { name: 'Agregar · $85.00' })).toBeEnabled()
  await dialogCombo.getByRole('button', { name: 'Agregar · $85.00' }).click()

  await page.getByRole('button', { name: 'Transferencia', exact: true }).click()
  await expect(page.getByText('$140.00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezado = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezado).toBeVisible()
  const pedidoId = (await encabezado.textContent()).match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()

  await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
  await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
  await expect(page.getByText(`Mitad y mitad: ${saborUno} + ${saborDos}`)).toBeVisible()
  await expect(page.getByText(modificador, { exact: true })).toBeVisible()
  await expect(page.getByText(combo, { exact: true })).toBeVisible()
})

test('registra la devolución de una venta y devuelve el producto al inventario', async ({ page }) => {
  const nombreProducto = `Producto devolución E2E ${Date.now()}`
  await iniciarSesion(page)
  await configurarProductoReventa(page, nombreProducto)
  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Cliente de mostrador').fill('Cliente devolución E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await page.getByRole('button', { name: '$50.00', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezado = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezado).toBeVisible()
  const pedidoId = (await encabezado.textContent()).match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()

  await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
  await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
  await page.getByRole('button', { name: 'Pasar a En preparación', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar Entregado', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar devolución', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Registrar devolución' })).toBeVisible()
  await dialog.getByLabel('¿Regresar al inventario?').check()
  await dialog.getByRole('button', { name: 'Registrar devolución', exact: true }).click()
  await expect(page.getByText('Devolución registrada', { exact: true }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Venta ya devuelta', exact: true })).toBeDisabled()

  await page.goto('/inventario')
  const filaProducto = page.locator('li').filter({ hasText: nombreProducto })
  await expect(filaProducto.getByText('5', { exact: true })).toBeVisible()
})

test('el repartidor entrega y cobra únicamente el pedido domiciliario asignado', async ({ page }) => {
  const nombreProducto = `Producto entrega E2E ${Date.now()}`
  await iniciarSesion(page)
  await configurarProductoReventa(page, nombreProducto)

  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'A domicilio', exact: true }).click()
  await page.getByRole('button', { name: 'Por teléfono', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Ana Martínez, Av. Principal 12').fill('Cliente entrega E2E')
  await page.getByPlaceholder(/casa azul, frente a la tienda/).fill('Casa de prueba E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await page.getByRole('button', { name: 'Transferencia', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezado = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezado).toBeVisible()
  const pedidoId = (await encabezado.textContent()).match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()

  await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
  await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
  await page.getByRole('button', { name: 'Pasar a En preparación', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar Enviado', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Repartidor de pruebas E2E' }).click()
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByText('Pedido enviado', { exact: true }).last()).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Menú de opciones' }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click()
  await iniciarSesion(page, 'e2e-repartidor', 'e2e-courier-password')
  const pedido = page.locator('article').filter({ hasText: `Pedido #${pedidoId}` })
  await expect(pedido).toBeVisible()
  await pedido.getByRole('button', { name: 'Marcar Entregado', exact: true }).click()
  await expect(page.getByText('Pedido entregado y cobrado. Venta generada.', { exact: true })).toBeVisible()
  await expect(pedido.getByText('Entregado', { exact: true })).toBeVisible()
  await expect(pedido.getByText('Pagado', { exact: true })).toBeVisible()
  await expect(pedido.getByRole('button', { name: 'Marcar Entregado', exact: true })).toHaveCount(0)
})

test('permite devolver una venta parcialmente en dos operaciones sin exceder cantidades ni importes', async ({
  page,
}) => {
  const nombreProducto = `Producto devolución parcial E2E ${Date.now()}`
  await iniciarSesion(page)
  await configurarProductoReventa(page, nombreProducto)

  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Cliente de mostrador').fill('Cliente devolución parcial E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await page.getByRole('button', { name: 'Aumentar cantidad', exact: true }).click()
  await page.getByRole('button', { name: '$100.00', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezado = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezado).toBeVisible()
  const pedidoId = (await encabezado.textContent()).match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()

  await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
  await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
  await page.getByRole('button', { name: 'Pasar a En preparación', exact: true }).click()
  await page.getByRole('button', { name: 'Marcar Entregado', exact: true }).click()

  const registrarDevolucion = async (cantidad, monto) => {
    await page.getByRole('button', { name: 'Registrar devolución', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: new RegExp(`2× ${nombreProducto}`) }).click()
    await expect(dialog.getByLabel(`Cantidad a devolver de ${nombreProducto}`)).toHaveValue(
      String(cantidad),
    )
    await dialog.getByLabel('¿Regresar al inventario?').check()
    await expect(dialog.getByLabel('Monto a devolver')).toHaveValue(String(monto))
    return dialog
  }

  const primeraDevolucion = await registrarDevolucion(2, 80)
  await primeraDevolucion.getByLabel('Cantidad a devolver de ' + nombreProducto).fill('1')
  await expect(primeraDevolucion.getByLabel('Monto a devolver')).toHaveValue('40')
  await primeraDevolucion.getByRole('button', { name: 'Registrar devolución', exact: true }).click()
  await expect(page.getByText('Devolución registrada', { exact: true }).last()).toBeVisible()

  const segundaDevolucion = await registrarDevolucion(1, 40)
  await segundaDevolucion.getByLabel('Monto a devolver').fill('50')
  await segundaDevolucion.getByRole('button', { name: 'Registrar devolución', exact: true }).click()
  await expect(
    segundaDevolucion.getByText(/excede lo que falta de la venta/),
  ).toBeVisible()
  await segundaDevolucion.getByLabel('Monto a devolver').fill('40')
  await segundaDevolucion.getByRole('button', { name: 'Registrar devolución', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Venta ya devuelta', exact: true })).toBeDisabled()

  await page.goto('/inventario')
  const filaProducto = page.locator('li').filter({ hasText: nombreProducto })
  await expect(filaProducto.getByText('5', { exact: true })).toBeVisible()
})

test('cancela pedidos pendientes y pagados con decisiones independientes de inventario y reembolso', async ({
  page,
}) => {
  const nombreProducto = `Producto cancelación E2E ${Date.now()}`
  await iniciarSesion(page)
  await configurarProductoReventa(page, nombreProducto)

  const crearPedido = async (metodoPago) => {
    await page.goto('/pedidos/nuevo')
    await page.getByRole('button', { name: 'Para recoger', exact: true }).click()
    if (metodoPago === 'Transferencia') {
      await page.getByRole('button', { name: 'Por teléfono', exact: true }).click()
      await page.getByRole('button', { name: 'Transferencia', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
    await page.getByPlaceholder('Ej. Cliente de mostrador').fill(`Cliente cancelación ${metodoPago}`)
    await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
    if (metodoPago === 'Efectivo') {
      await page.getByRole('button', { name: '$50.00', exact: true }).click()
    }
    await page.getByRole('button', { name: 'Confirmar pedido' }).click()
    const encabezado = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
    await expect(encabezado).toBeVisible()
    const pedidoId = (await encabezado.textContent()).match(/\d+/)?.[0]
    expect(pedidoId).toBeTruthy()
    return pedidoId
  }

  const cancelarPedido = async (pedidoId, regresaInventario, devolverDinero) => {
    await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
    await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
    await page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Cancelar pedido', exact: true }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByRole('button', {
      name: regresaInventario ? 'Sí, regresar' : 'No regresar',
      exact: true,
    }).click()

    if (devolverDinero !== null) {
      dialog = page.getByRole('dialog')
      await dialog
        .getByRole('button', {
          name: devolverDinero ? 'Sí, devolver' : 'No devolver',
          exact: true,
        })
        .click()
      if (devolverDinero) {
        dialog = page.getByRole('dialog')
        await dialog
          .getByRole('combobox')
          .selectOption({ label: 'Efectivo (se resta de esta caja)' })
        await dialog.getByRole('button', { name: 'Devolver y cancelar', exact: true }).click()
      }
    }
    await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  }

  const pedidoPendiente = await crearPedido('Transferencia')
  await cancelarPedido(pedidoPendiente, false, null)
  await page.goto('/inventario')
  const filaProducto = page.locator('li').filter({ hasText: nombreProducto })
  await expect(filaProducto.getByText('4', { exact: true })).toBeVisible()

  const pedidoPagado = await crearPedido('Efectivo')
  await cancelarPedido(pedidoPagado, true, false)
  await page.goto('/inventario')
  await expect(filaProducto.getByText('4', { exact: true })).toBeVisible()

  const pedidoPagadoConDevolucion = await crearPedido('Efectivo')
  await cancelarPedido(pedidoPagadoConDevolucion, false, true)
  await page.goto('/inventario')
  await expect(filaProducto.getByText('3', { exact: true })).toBeVisible()
})

test('registra entradas, ajustes, gastos e ingresos y cuadra el efectivo al cerrar caja', async ({
  page,
}) => {
  const nombreProducto = `Producto caja inventario E2E ${Date.now()}`
  await iniciarSesion(page)
  await page.goto('/caja')
  if (await page.getByText('No hay caja abierta', { exact: true }).isVisible()) {
    await page.getByLabel('Fondo inicial').fill('100')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    const apertura = page.getByRole('dialog')
    const abrirAhora = apertura.getByRole('button', { name: 'No, abrir de inmediato' })
    if (await abrirAhora.isVisible()) await abrirAhora.click()
    await apertura.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  }
  await expect(page.getByText('Caja abierta')).toBeVisible()

  await page.getByRole('button', { name: 'Ver resumen', exact: true }).click()
  const resumenAntes = page.getByRole('dialog')
  const textoEfectivoAntes = await resumenAntes
    .getByText('Efectivo esperado', { exact: true })
    .locator('..')
    .textContent()
  const efectivoAntes = Number(textoEfectivoAntes.match(/\$([\d,.]+)/)?.[1].replaceAll(',', ''))
  expect(Number.isFinite(efectivoAntes)).toBe(true)
  await resumenAntes.getByRole('button', { name: 'Entendido', exact: true }).click()

  await configurarProductoReventa(page, nombreProducto)
  await page.goto('/inventario')
  await page.getByRole('button', { name: 'Registrar entrada', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.locator('select').selectOption({ label: `${nombreProducto} (reventa)` })
  await dialog.getByLabel('Cantidad', { exact: true }).fill('3')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  const filaProducto = page.locator('li').filter({ hasText: nombreProducto })
  await expect(filaProducto.getByText('8', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Ajuste manual', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.locator('select').first().selectOption({ label: `${nombreProducto} (reventa)` })
  await dialog.getByLabel('Stock real contado').fill('6')
  await expect(dialog.getByText(/Diferencia: -2 menos/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(filaProducto.getByText('6', { exact: true })).toBeVisible()

  await page.goto('/caja')
  await page.getByRole('button', { name: 'Gastos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo gasto', exact: false }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Concepto').fill('Gasto de verificación E2E')
  await dialog.getByLabel('Monto', { exact: true }).fill('20')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Gasto de verificación E2E', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Ingresos', exact: true }).click()
  await page.getByRole('button', { name: 'Nuevo ingreso', exact: false }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Monto', { exact: true }).fill('10')
  await dialog.getByLabel(/Motivo/).fill('Ingreso de verificación E2E')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Ingreso de verificación E2E', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Caja', exact: true }).click()
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Efectivo contado').fill(String(efectivoAntes - 10))
  await dialog.getByRole('button', { name: 'Cerrar caja', exact: true }).click()
  const cierre = page.getByRole('dialog')
  const textoEfectivoCierre = await cierre
    .getByText('Efectivo esperado', { exact: true })
    .locator('..')
    .textContent()
  const efectivoCierre = Number(textoEfectivoCierre.match(/\$([\d,.]+)/)?.[1].replaceAll(',', ''))
  expect(efectivoCierre).toBe(efectivoAntes - 10)
  await expect(cierre.getByText('Cuadra exacto', { exact: true })).toBeVisible()
})

test('aplica costo de envío y cambio a domicilio y rechaza saltos inválidos de estado', async ({
  page,
}) => {
  const nombreProducto = `Producto reglas domicilio E2E ${Date.now()}`
  await iniciarSesion(page)
  await configurarProductoReventa(page, nombreProducto)
  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByLabel('Costo de envío').fill('15')
  await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click()
  await expect(page.getByText('Configuración guardada', { exact: true }).last()).toBeVisible()

  await page.goto('/caja')
  await expect(
    page
      .getByText('Caja abierta', { exact: true })
      .or(page.getByText('No hay caja abierta', { exact: true })),
  ).toBeVisible()
  if (await page.getByText('No hay caja abierta', { exact: true }).isVisible()) {
    await page.getByLabel('Fondo inicial').fill('100')
    await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
    const apertura = page.getByRole('dialog')
    const abrirAhora = apertura.getByRole('button', { name: 'No, abrir de inmediato' })
    if (await abrirAhora.isVisible()) await abrirAhora.click()
    await apertura.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  }

  await page.goto('/pedidos/nuevo')
  await page.getByRole('button', { name: 'A domicilio', exact: true }).click()
  await page.getByRole('button', { name: 'Por teléfono', exact: true }).click()
  await page.getByRole('button', { name: 'Nombre libre', exact: true }).click()
  await page.getByPlaceholder('Ej. Ana Martínez, Av. Principal 12').fill('Cliente reglas domicilio E2E')
  await page.getByPlaceholder(/casa azul, frente a la tienda/).fill('Referencia reglas domicilio E2E')
  await page.getByRole('button', { name: new RegExp(nombreProducto) }).click()
  await expect(page.getByText('Envío', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('$55.00', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '$100.00', exact: true }).click()
  await expect(page.getByText('$45.00', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()

  const encabezado = page.getByRole('heading', { name: /Pedido #\d+ creado/ })
  await expect(encabezado).toBeVisible()
  const pedidoId = (await encabezado.textContent()).match(/\d+/)?.[0]
  expect(pedidoId).toBeTruthy()
  const token = await page.evaluate(() => localStorage.getItem('pos.token'))
  const respuestaTransicion = await page.request.patch(
    `/api/pedidos/${pedidoId}/estado-preparacion`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { estadoPreparacion: 'Entregado' },
    },
  )
  expect(respuestaTransicion.status()).toBe(400)

  await page.getByRole('button', { name: 'Ir a Pedidos' }).click()
  await page.getByRole('button', { name: new RegExp(`Pedido #${pedidoId}`) }).click()
  await expect(page.getByText('$15.00', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('$45.00', { exact: true }).last()).toBeVisible()

  await page.goto('/configuracion')
  await page.getByRole('button', { name: 'General', exact: true }).click()
  await page.getByLabel('Costo de envío').fill('0')
  await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click()
  await expect(page.getByText('Configuración guardada', { exact: true }).last()).toBeVisible()
})
