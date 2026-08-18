import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3001'
let fallas = 0
let token = null

function ok(cond, nombre) {
  if (cond) console.log(`  OK  ${nombre}`)
  else {
    fallas++
    console.log(`FALLA ${nombre}`)
  }
}

async function req(method, path, body) {
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, data }
}

async function stockProducto(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: id } })
  return agg._sum.cantidad ?? 0
}

async function stockIngrediente(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: id } })
  return agg._sum.cantidad ?? 0
}

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test6', contraseña: await bcrypt.hash('x', 10) } })

async function loginAdmin() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test6', contraseña: 'x' }),
  })
  const data = await res.json()
  token = data.token
  return res.status
}

const harina = await prisma.ingrediente.create({
  data: { nombre: 'Harina6', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 2 },
})
await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
const torta = await prisma.producto.create({ data: { nombre: 'Torta6', precio: 25, tipo: 'Con_receta' } })
await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: harina.id, cantidad: 2 } })
const coca = await prisma.producto.create({ data: { nombre: 'Coca6', precio: 15, tipo: 'Reventa_directa' } })
await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })

try {
  console.log('== Autenticación ==')
  ok((await loginAdmin()) === 200, 'login admin')

  console.log('== Configuracion global ==')
  const cfg = await req('GET', '/api/config')
  ok(cfg.status === 200 && cfg.data.costoEnvio === 0 && cfg.data.repartidorUnico === false, 'config por defecto (costo 0, repartidor no unico)')
  const cfgEnvio = await req('PATCH', '/api/config/costo-envio', { costoEnvio: 5 })
  ok(cfgEnvio.status === 200 && cfgEnvio.data.costoEnvio === 5, 'actualizar costo_envio a 5')
  const cfgUnico = await req('PATCH', '/api/config/repartidor-unico', { repartidorUnico: true })
  ok(cfgUnico.status === 200 && cfgUnico.data.repartidorUnico === true, 'activar repartidor unico')

  console.log('== Cliente y Referencias ==')
  const c1 = await req('POST', '/api/clientes', { nombre: 'Juan', telefono: '555-1234' })
  ok(c1.status === 201 && c1.data.nombre === 'Juan' && c1.data.estado === 'Activo', 'crear cliente')
  const ref1 = await req('POST', `/api/clientes/${c1.data.id}/referencias`, { descripcion: 'casa azul, frente a la tienda' })
  ok(ref1.status === 201 && ref1.data.descripcion.includes('casa azul'), 'crear referencia landmark')
  const refs = await req('GET', `/api/clientes/${c1.data.id}/referencias`)
  ok(refs.status === 200 && refs.data.length === 1, 'listar referencias del cliente')
  const updRef = await req('PATCH', `/api/clientes/referencias/${ref1.data.id}`, { estado: 'Inactivo' })
  ok(updRef.status === 200 && updRef.data.estado === 'Inactivo', 'actualizar referencia (estado)')
  // Bug 1 (regresión): PATCH de cliente debe conservar `pedidos` en la respuesta
  // (el frontend reemplaza su detalle con esta respuesta y renderiza pedidos).
  const patchCli = await req('PATCH', `/api/clientes/${c1.data.id}`, { estado: 'Inactivo' })
  ok(patchCli.status === 200 && Array.isArray(patchCli.data.pedidos), 'PATCH cliente incluye arreglo pedidos')
  ok(patchCli.data.estado === 'Inactivo' && Array.isArray(patchCli.data.referencias), 'PATCH cliente conserva estado y referencias')
  const delRef = await req('DELETE', `/api/clientes/referencias/${ref1.data.id}`)
  ok(delRef.status === 204, 'eliminar referencia sin pedidos -> 204')
  const delCli = await req('DELETE', `/api/clientes/${c1.data.id}`)
  ok(delCli.status === 204, 'eliminar cliente sin pedidos -> 204')

  console.log('== Empleado (Repartidor) ==')
  const emp = await req('POST', '/api/empleados', { nombre: 'Pedro', usuario: 'pedro6', contraseña: 'pass123' })
  ok(emp.status === 201 && emp.data.estadoDisponibilidad === 'Disponible' && emp.data.usuario.tipo === 'Repartidor', 'alta repartidor con Usuario vinculado')
  ok(emp.data.usuarioId !== null, 'Empleado.usuarioId vinculado')
  const upEmp = await req('PATCH', `/api/empleados/${emp.data.id}`, { estadoDisponibilidad: 'No_disponible_hoy' })
  ok(upEmp.status === 200 && upEmp.data.estadoDisponibilidad === 'No_disponible_hoy', 'repartidor no disponible hoy')
  const upEmp2 = await req('PATCH', `/api/empleados/${emp.data.id}`, { estadoDisponibilidad: 'Disponible' })
  ok(upEmp2.status === 200, 'repartidor disponible de nuevo')

  console.log('== Abrir caja ==')
  const abrir = await req('POST', '/api/caja/abrir', { fondoInicial: 100, usuarioId: admin.id })
  ok(abrir.status === 201 && abrir.data.diaOperativo.estado === 'Abierto', 'caja abierta')

  console.log('== Pedido 1: Mostrador + Para_recoger (pago inmediato) ==')
  const p1 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Mostrador',
    clienteId: null,
    nombreClienteLibre: 'Cliente X',
    productos: [{ productoId: coca.id, cantidad: 2 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 50,
    usuarioId: admin.id,
  })
  ok(p1.status === 201 && p1.data.estadoPago === 'Pagado', 'Mostrador+Para_recoger -> Pagado al capturar')
  ok(p1.data.estadoPreparacion === 'Pendiente', 'estado_preparacion inicial Pendiente')
  ok(p1.data.total === 30 && p1.data.cambioALlevar === 20, 'total 30, cambio a llevar 20')
  ok(p1.data.venta !== null, 'venta generada automáticamente al capturar')
  ok((await stockProducto(coca.id)) === 8, 'stock coca 10->8 (venta inmediata)')
  ok(p1.data.costoEnvio === null, 'sin costo de envio (Para_recoger)')

  console.log('== Pedido 2: Mostrador + A_domicilio (pendiente de pago) ==')
  const p2 = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio',
    origen: 'Mostrador',
    clienteId: null,
    nombreClienteLibre: 'María',
    referenciaLibre: 'calle falsa 123, junto al parque',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(p2.status === 201 && p2.data.estadoPago === 'Pendiente_pago', 'Mostrador+A_domicilio -> Pendiente_pago')
  ok(p2.data.costoEnvio === 5 && p2.data.total === 20, 'costo_envio 5 aplicado (total 20)')
  ok(p2.data.referenciaLibre === 'calle falsa 123, junto al parque', 'referencia libre (texto) almacenada en el pedido')
  ok(p2.data.referenciaId === null, 'sin referenciaId (cliente no registrado)')
  ok(p2.data.venta === null, 'aun sin venta')
  // Rediseño (docs/04 + docs/06): la reserva de inventario se hace AL CREAR
  // el pedido, no al pagar. Tras p1 (2 coca) y p2 (1 coca) quedan 7.
  ok((await stockProducto(coca.id)) === 7, 'inventario bloqUEADO al crear (coca 8->7)')

  console.log('== Pedido 3: Telefono + Para_recoger (pendiente de pago) ==')
  const p3 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Telefono',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(p3.status === 201 && p3.data.estadoPago === 'Pendiente_pago', 'Telefono+Para_recoger -> Pendiente_pago')
  ok(p3.data.total === 15 && p3.data.cambioALlevar === 85, 'total 15, cambio 85')

  console.log('== Pedido 4: Telefono + A_domicilio (pendiente de pago) ==')
  const p4 = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio',
    origen: 'Telefono',
    nombreClienteLibre: 'Luis',
    referenciaLibre: 'Av. Siempre Viva 742',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Transferencia',
    usuarioId: admin.id,
  })
  ok(p4.status === 201 && p4.data.estadoPago === 'Pendiente_pago', 'Telefono+A_domicilio -> Pendiente_pago')
  ok(p4.data.total === 20 && p4.data.costoEnvio === 5, 'total 20 con envio')
  ok(p4.data.referenciaLibre === 'Av. Siempre Viva 742', 'referencia libre almacenada (Transferencia)')

  console.log('== Validaciones de pedido ==')
  const malMetodo = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Tarjeta', usuarioId: admin.id,
  })
  ok(malMetodo.status === 400 && /A_domicilio/i.test(malMetodo.data.message), 'A_domicilio no permite Tarjeta -> 400')
  const malRef = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', referenciaId: 1,
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(malRef.status === 400 && /referenciaId/i.test(malRef.data.message), 'referenciaId solo para A_domicilio -> 400')

  console.log('== Referencia de entrega en A_domicilio (exactamente una) ==')
  const sinRefDomicilio = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Sin Ref',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(sinRefDomicilio.status === 400 && /referenciaLibre/i.test(sinRefDomicilio.data.message), 'A_domicilio sin ninguna referencia -> 400 con error claro')
  const ambasRefs = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Ambas',
    referenciaId: 1, referenciaLibre: 'calle x',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(ambasRefs.status === 400 && /no ambos/i.test(ambasRefs.data.message), 'A_domicilio con referenciaId Y referenciaLibre -> 400 (no ambos)')
  const refLibreRecoger = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', referenciaLibre: 'calle x',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(refLibreRecoger.status === 400 && /referenciaLibre/i.test(refLibreRecoger.data.message), 'referenciaLibre solo para A_domicilio -> 400')

  console.log('== Edicion de pedido (P3) ==')
  const det3 = await req('GET', `/api/pedidos/${p3.data.id}/detalle`)
  const pp3 = det3.data.productos[0]
  const editado = await req('PATCH', `/api/pedidos/${p3.data.id}`, {
    agregarProductos: [{ productoId: coca.id, cantidad: 1 }],
    quitarProductos: [{ pedidoProductoId: pp3.id, regresaAInventario: false }],
  })
  ok(editado.status === 200 && editado.data.pedido.total === 15, 'edicion recalcula total (quita 1, agrega 1 -> 15)')
  const det3b = await req('GET', `/api/pedidos/${p3.data.id}/detalle`)
  ok(det3b.data.productos.length === 1 && det3b.data.productos[0].cantidad === 1, 'quedó 1 producto en el pedido')
  const malEdicion = await req('PATCH', `/api/pedidos/${p3.data.id}`, {
    quitarProductos: [{ pedidoProductoId: pp3.id, regresaAInventario: false }],
  })
  ok(malEdicion.status === 404, 'quitar el mismo producto ya eliminado -> 404')

  console.log('== Edicion con stock insuficiente (Bug 3) ==')
  const pSinStock = await req('POST', '/api/productos', { nombre: 'SinStock6', precio: 5, tipo: 'Reventa_directa' })
  const editSinStock = await req('PATCH', `/api/pedidos/${p3.data.id}`, {
    agregarProductos: [{ productoId: pSinStock.data.id, cantidad: 2 }],
  })
  ok(editSinStock.status === 409, 'agregar producto sin stock -> 409')
  const detSinStock = await req('GET', `/api/pedidos/${p3.data.id}/detalle`)
  ok(
    detSinStock.data.productos.every((pp) => pp.producto?.id !== pSinStock.data.id),
    'el producto sin stock NO quedó guardado en el pedido (transacción revierte)',
  )

  console.log('== Pago diferido (P2) ==')
  // El pago re-vincula la reserva a la venta; no vuelve a descontar stock.
  const stockAntesPago2 = await stockProducto(coca.id)
  const pagar2 = await req('PATCH', `/api/pedidos/${p2.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagar2.status === 200 && pagar2.data.pedido.estadoPago === 'Pagado', 'P2 pasa a Pagado')
  ok(pagar2.data.venta && pagar2.data.venta.total === 20, 'venta generada con total 20 (incluye envio)')
  ok((await stockProducto(coca.id)) === stockAntesPago2, 'pagar NO descuenta de nuevo (reserva hecha al crear; coca fija en ' + stockAntesPago2 + ')')

  console.log('== Asignacion de repartidor (P4, repartidor unico activo) ==')
  // Secuencia estricta: Pendiente -> En_preparacion -> Enviado (docs/06).
  const enPrep4 = await req('PATCH', `/api/pedidos/${p4.data.id}/estado-preparacion`, { estadoPreparacion: 'En_preparacion' })
  ok(enPrep4.status === 200 && enPrep4.data.pedido.estadoPreparacion === 'En_preparacion', 'P4 pasa a En_preparacion')
  const enviado = await req('PATCH', `/api/pedidos/${p4.data.id}/estado-preparacion`, { estadoPreparacion: 'Enviado' })
  ok(enviado.status === 200 && enviado.data.pedido.repartidorId === emp.data.id, 'repartidor unico asignado automaticamente al Enviar')
  const malEnviado = await req('PATCH', `/api/pedidos/${p3.data.id}/estado-preparacion`, { estadoPreparacion: 'Enviado' })
  ok(malEnviado.status === 400, 'Para_recoger no puede pasar a Enviado -> 400')
  const entregado = await req('PATCH', `/api/pedidos/${p4.data.id}/estado-preparacion`, { estadoPreparacion: 'Entregado' })
  ok(entregado.status === 200 && entregado.data.pedido.estadoPreparacion === 'Entregado', 'P4 Entregado')

  console.log('== Cancelacion con regreso a inventario (P1, ya pagado) ==')
  const antes = await stockProducto(coca.id)
  const cancelar1 = await req('PATCH', `/api/pedidos/${p1.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado',
    regresaAInventario: true,
  })
  ok(cancelar1.status === 200 && cancelar1.data.pedido.estadoPreparacion === 'Cancelado', 'P1 Cancelado')
  ok(cancelar1.data.movimientosCancelacionRegreso === 1, '1 movimiento Cancelacion_regreso (coca x2 en una sola cuenta)')
  ok((await stockProducto(coca.id)) === antes + 2, 'stock regresado (coca +2)')
  const malCancelado = await req('PATCH', `/api/pedidos/${p1.data.id}/estado-preparacion`, { estadoPreparacion: 'Entregado' })
  ok(malCancelado.status === 400, 'pedido Cancelado ya no admite cambios -> 400')

  console.log('== Listados ==')
  const lista = await req('GET', '/api/pedidos')
  ok(lista.status === 200 && lista.data.length === 4, 'listar 4 pedidos')
  const filtro = await req('GET', '/api/pedidos?estadoPreparacion=Pendiente')
  ok(filtro.status === 200 && filtro.data.every((p) => p.estadoPreparacion === 'Pendiente'), 'filtro por estado_preparacion')
  const porRepartidor = await req('GET', `/api/pedidos/repartidor/${emp.data.id}`)
  ok(porRepartidor.status === 200 && porRepartidor.data.some((p) => p.id === p4.data.id), 'pedidos del repartidor')

  console.log('== Cliente con historial: no se elimina ==')
  const c2 = await req('POST', '/api/clientes', { nombre: 'Ana' })
  ok(c2.status === 201, 'crear cliente Ana')
  const pAna = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', clienteId: c2.data.id,
    productos: [{ productoId: torta.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pAna.status === 201, 'pedido con cliente registrado (consume 2 harina)')
  const delConHistorial = await req('DELETE', `/api/clientes/${c2.data.id}`)
  ok(delConHistorial.status === 409, 'cliente con pedidos no se elimina -> 409')

  console.log('== Combo en pedido: pago inmediato y pago diferido ==')
  const combo = await prisma.combo.create({ data: { nombre: 'Combo Pedido', precioEspecial: 35 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: torta.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: coca.id, cantidad: 1 } })

  // Mostrador + Para_recoger cobra al capturar: la Venta se genera con el
  // precio del combo y descuenta la receta del producto + el stock reventa.
  const pCombo = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Mostrador',
    nombreClienteLibre: 'ComboX',
    productos: [{ comboId: combo.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 50,
    usuarioId: admin.id,
  })
  ok(pCombo.status === 201 && pCombo.data.estadoPago === 'Pagado', 'pedido con combo (Mostrador+Para_recoger) -> Pagado')
  ok(pCombo.data.total === 35, 'pedido combo total 35 (precio del combo, no suma de productos)')
  ok(pCombo.data.venta && pCombo.data.venta.total === 35, 'venta generada del combo total 35')
  ok(pCombo.data.productos.length === 2, 'pedido combo expandido en 2 filas (una por producto)')
  ok((await stockProducto(coca.id)) === 5, 'combo reserva reventa al CREAR (coca 6->5)')
  const stockHarina6 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina6._sum.cantidad === 6, 'combo reserva la receta al CREAR (harina 8->6)')

  // Telefono + Para_recoger queda Pendiente_pago; al pagar se genera la Venta
  // reconstruyendo el combo desde las filas del Pedido_Producto.
  const pCombo2 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger',
    origen: 'Telefono',
    nombreClienteLibre: 'ComboY',
    productos: [{ comboId: combo.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 50,
    usuarioId: admin.id,
  })
  ok(pCombo2.status === 201 && pCombo2.data.estadoPago === 'Pendiente_pago', 'pedido combo Telefono -> Pendiente_pago')
  ok(pCombo2.data.venta === null, 'sin venta hasta pagar')
  const cocaAntesPagoCombo2 = await stockProducto(coca.id)
  const pagarCombo2 = await req('PATCH', `/api/pedidos/${pCombo2.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarCombo2.status === 200 && pagarCombo2.data.venta.total === 35, 'pago diferido del combo -> venta total 35')
  ok((await stockProducto(coca.id)) === cocaAntesPagoCombo2, 'pagar el combo NO vuelve a descontar la reventa (coca ' + cocaAntesPagoCombo2 + ')')
  const stockHarina7 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina7._sum.cantidad === 4, 'harina reservada al CREAR el combo (8->6->4)')

  console.log('== Pedido con combo + modificador Agregar: reserva al CREAR descuenta el extra ==')
  const ingAg6 = await prisma.ingrediente.create({ data: { nombre: 'IngAg6', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingAg6.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const extraAg6 = await prisma.ingrediente.create({ data: { nombre: 'ExtraAg6', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: extraAg6.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodAg6 = await prisma.producto.create({ data: { nombre: 'ProdAg6', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodAg6.id, ingredienteId: ingAg6.id, cantidad: 1 } })
  const modAg6 = await prisma.modificador.create({
    data: { nombre: 'ModAgregar6', tipo: 'Agregar', ingredienteAfectadoId: extraAg6.id, cantidadExtra: 2, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodAg6.id, modificadorId: modAg6.id } })
  const comboAg6 = await prisma.combo.create({ data: { nombre: 'ComboAg6', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboAg6.id, productoId: prodAg6.id, cantidad: 1 } })

  const stockIngAg6_0 = await stockIngrediente(ingAg6.id)
  const stockExtraAg6_0 = await stockIngrediente(extraAg6.id)
  const pComboAg6 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Agregar 6',
    productos: [{ comboId: comboAg6.id, cantidad: 2, productos: [{ productoId: prodAg6.id, modificadores: [{ modificadorId: modAg6.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pComboAg6.status === 201 && pComboAg6.data.estadoPago === 'Pendiente_pago', 'pedido combo+Agregar -> Pendiente_pago')
  ok(pComboAg6.data.venta === null, 'sin venta hasta pagar (Telefono+Para_recoger)')
  ok((await stockIngrediente(ingAg6.id)) === stockIngAg6_0 - 2, 'reserva al CREAR descuenta la receta base del combo (1x2)')
  ok((await stockIngrediente(extraAg6.id)) === stockExtraAg6_0 - 4, 'reserva al CREAR descuenta el extra del modificador Agregar (2x2)')
  const pagarComboAg6 = await req('PATCH', `/api/pedidos/${pComboAg6.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pComboAg6.data.total === 66, 'pedido combo+Agregar -> total 66 ((30 base + 3 extra) x2)')
  ok(pagarComboAg6.status === 200 && pagarComboAg6.data.venta.total === 66, 'pago del combo+Agregar -> venta 66 (el Agregar SÍ suma al precio)')
  ok(
    pComboAg6.data.productos.every((pp) => pp.comboPrecioCongelado === 33),
    'precio del combo congelado en 33 (base 30 + extra 3)',
  )
  ok((await stockIngrediente(ingAg6.id)) === stockIngAg6_0 - 2, 'pagar NO vuelve a descontar la receta (reserva ya hecha)')
  ok((await stockIngrediente(extraAg6.id)) === stockExtraAg6_0 - 4, 'pagar NO vuelve a descontar el extra (reserva ya hecha)')

  console.log('== Pedido con combo + modificador Sustituir: reserva al CREAR descuenta el sustituto ==')
  const ingA6 = await prisma.ingrediente.create({ data: { nombre: 'IngA6', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingA6.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const ingB6 = await prisma.ingrediente.create({ data: { nombre: 'IngB6', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingB6.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodS6 = await prisma.producto.create({ data: { nombre: 'ProdS6', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodS6.id, ingredienteId: ingA6.id, cantidad: 1 } })
  const modS6 = await prisma.modificador.create({
    data: { nombre: 'ModSustituir6', tipo: 'Sustituir', ingredienteAfectadoId: ingA6.id, ingredienteSustitutoId: ingB6.id, cantidadSustituto: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodS6.id, modificadorId: modS6.id } })
  const comboS6 = await prisma.combo.create({ data: { nombre: 'ComboS6', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboS6.id, productoId: prodS6.id, cantidad: 1 } })

  const stockIngA6_0 = await stockIngrediente(ingA6.id)
  const stockIngB6_0 = await stockIngrediente(ingB6.id)
  const pComboS6 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Sustituir 6',
    productos: [{ comboId: comboS6.id, cantidad: 1, productos: [{ productoId: prodS6.id, modificadores: [{ modificadorId: modS6.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pComboS6.status === 201 && pComboS6.data.estadoPago === 'Pendiente_pago', 'pedido combo+Sustituir -> Pendiente_pago')
  ok(pComboS6.data.venta === null, 'sin venta hasta pagar')
  ok((await stockIngrediente(ingA6.id)) === stockIngA6_0, 'reserva al CREAR NO descuenta el ingrediente afectado A (se elimina de la receta)')
  ok((await stockIngrediente(ingB6.id)) === stockIngB6_0 - 3, 'reserva al CREAR descuenta el sustituto B (cantidadSustituto 3)')
  const pagarComboS6 = await req('PATCH', `/api/pedidos/${pComboS6.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarComboS6.status === 200 && pagarComboS6.data.venta.total === 30, 'pago del combo+Sustituir -> venta 30')
  ok((await stockIngrediente(ingB6.id)) === stockIngB6_0 - 3, 'pagar NO vuelve a descontar el sustituto (reserva ya hecha)')

  console.log('== Pedido viejo sin reserva: al pagarse valida stock (no descuenta a ciegas) ==')
  // Simula un pedido creado ANTES del rediseño de reserva (commit 2f87347):
  // se borran sus movimientos de reserva y el stock del ingrediente ya se
  // consumió en otra venta. Al pagarse se valida el stock como una venta
  // normal: 409 con faltantes y, con usarDisponible, descuento topeado (nunca
  // negativo).
  const ingR6 = await prisma.ingrediente.create({ data: { nombre: 'IngR6', unidadMedida: 'kg', stockActual: 1, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR6.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  const prodR6 = await prisma.producto.create({ data: { nombre: 'ProdR6', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodR6.id, ingredienteId: ingR6.id, cantidad: 1 } })
  const pR6 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Viejo sin reserva 6',
    productos: [{ productoId: prodR6.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pR6.status === 201 && pR6.data.estadoPago === 'Pendiente_pago', 'pedido creado Pendiente_pago (con reserva)')
  ok((await stockIngrediente(ingR6.id)) === 0, 'reserva al crear: stock 1 - 1 = 0')
  const borradosR6 = await prisma.movimiento_Inventario.deleteMany({
    where: { pedidoProductoId: { in: pR6.data.productos.map((x) => x.id) }, ventaProductoId: null },
  })
  ok(borradosR6.count > 0, 'reserva eliminada -> el pedido simula ser pre-rediseño (sin movimientos)')
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR6.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  ok((await stockIngrediente(ingR6.id)) === 0, 'el ingrediente ya se consumió en otra venta (disponible 0)')
  const pagoViejoR6 = await req('PATCH', `/api/pedidos/${pR6.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagoViejoR6.status === 409, 'pagar pedido viejo sin stock -> 409 (NO descuenta a ciegas)')
  ok(
    Array.isArray(pagoViejoR6.data?.stockInsuficiente) &&
      pagoViejoR6.data.stockInsuficiente.some((f) => f.id === ingR6.id && f.requerido === 1 && f.disponible === 0),
    '409 reporta el faltante (requerido 1, disponible 0)'
  )
  ok((await stockIngrediente(ingR6.id)) === 0, 'sin usarDisponible el stock sigue 0 (nada descontado)')
  const pagoViejoR6Usar = await req('PATCH', `/api/pedidos/${pR6.data.id}/estado-pago`, { estadoPago: 'Pagado', usarDisponible: true, usuarioId: admin.id })
  ok(pagoViejoR6Usar.status === 200 && pagoViejoR6Usar.data.pedido?.estadoPago === 'Pagado', 'con usarDisponible:true el pago procede ("Usar lo disponible")')
  ok((await stockIngrediente(ingR6.id)) === 0, 'descuento topeado a lo disponible: stock 0 (NUNCA negativo)')

  console.log('== Drift de receta: cancelación revierte EXACTO (no recalcula) ==')
  const pDrift = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador',
    productos: [{ productoId: torta.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pDrift.status === 201 && pDrift.data.estadoPago === 'Pagado', 'pedido torta pagado al capturar')
  const stockHarina8 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina8._sum.cantidad === 2, 'torta reserva 2 harina al CREAR (8->6->4->2)')
  // La receta cambia DESPUÉS de la venta: hoy pediría 5 harina por unidad.
  await prisma.producto_Ingrediente.update({
    where: { productoId_ingredienteId: { productoId: torta.id, ingredienteId: harina.id } },
    data: { cantidad: 5 },
  })
  const cancelDrift = await req('PATCH', `/api/pedidos/${pDrift.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado',
    regresaAInventario: true,
  })
  ok(cancelDrift.status === 200 && cancelDrift.data.movimientosCancelacionRegreso === 1, 'cancelacion revierte los movimientos exactos')
  const stockHarina9 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina9._sum.cantidad === 4, 'se revierte EXACTO (2, no la receta nueva de 5) -> harina 4')

  console.log('== usar_disponible: cancelar pedido revierte EXACTO el parcial ==')
  const capH2 = await prisma.ingrediente.create({ data: { nombre: 'CapH2', unidadMedida: 'kg', stockActual: 5, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: capH2.id, tipoMovimiento: 'Entrada', cantidad: 5 } })
  const capTorta2 = await prisma.producto.create({ data: { nombre: 'CapTorta2', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: capTorta2.id, ingredienteId: capH2.id, cantidad: 2 } })

  // Mostrador + Para_recoger paga al capturar; 3 tortas requieren 6 y hay 5:
  // "usar disponible" descuenta solo 5.
  const pCap = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador',
    nombreClienteLibre: 'CapPedido',
    productos: [{ productoId: capTorta2.id, cantidad: 3 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usarDisponible: [{ tipo: 'ingrediente', id: capH2.id }],
    usuarioId: admin.id,
  })
  ok(pCap.status === 201 && pCap.data.estadoPago === 'Pagado' && pCap.data.venta.total === 60, 'pedido con usar_disponible pagado al capturar (total 60)')
  const stockCap2_0 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: capH2.id } })
  ok(stockCap2_0._sum.cantidad === 0, 'descuenta el parcial (5 de 6 requeridos) -> capH2 0')
  const mvCapPedido = await prisma.movimiento_Inventario.findFirst({ where: { tipoMovimiento: 'Salida_venta', ingredienteId: capH2.id } })
  ok(mvCapPedido && mvCapPedido.ventaProductoId != null && mvCapPedido.pedidoProductoId != null, 'Salida_venta del parcial vinculada a ventaProductoId y pedidoProductoId')

  const cancelCap = await req('PATCH', `/api/pedidos/${pCap.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado',
    regresaAInventario: true,
  })
  ok(cancelCap.status === 200 && cancelCap.data.movimientosCancelacionRegreso === 1, 'cancelación revierte el movimiento del parcial')
  const stockCap2_1 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: capH2.id } })
  ok(stockCap2_1._sum.cantidad === 5, 'revierte EXACTO el parcial (5, no 6 de la receta ni 0) -> capH2 5')

  console.log('== Cierre de caja: aviso de pedidos pendientes ==')
  // Al final: P3 (Telefono+Para_recoger), P4 (Entregado) y el pedido de Ana
  // siguen Pendiente_pago; de esos, solo P4 está Entregado.
  const cerrar = await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  ok(cerrar.status === 200, 'cerrar caja')
  ok(cerrar.data.pedidosPendientesPago.cantidad === 3, 'aviso: 3 pedidos Pendiente_pago')
  ok(cerrar.data.pedidosEntregadosPendientesPago.cantidad === 1, 'aviso: 1 pedido Entregado+Pendiente_pago (cantidad real, no undefined)')
  ok(cerrar.data.pedidosEntregadosPendientesPago.monto === 20, 'aviso: monto de Entregado+Pendiente_pago = 20')

  console.log('== Monto de pago: estricto (A_domicilio) vs libre (Para_recoger) ==')
  // Para_recoger acepta CUALQUIER monto numérico válido >= total, aunque no
  // esté en las opciones configuradas (docs/07): el monto libre via "Otro".
  const montoLibre = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Monto Libre',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 37, usuarioId: admin.id,
  })
  ok(montoLibre.status === 201 && montoLibre.data.cambioALlevar === 22, 'Para_recoger acepta monto libre no configurado (37 -> cambio 22)')
  const montoBajo = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Monto Bajo',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 10, usuarioId: admin.id,
  })
  ok(montoBajo.status === 400 && /no cubre el total|cubrir el total/i.test(montoBajo.data.message), 'Para_recoger rechaza monto menor al total -> 400')
  // A_domicilio mantiene la validación estricta contra la lista configurada.
  const montoNoConfigDomicilio = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Monto Fijo',
    referenciaLibre: 'calle del monto 1',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 37, usuarioId: admin.id,
  })
  ok(montoNoConfigDomicilio.status === 400 && /opciones de cambio/i.test(montoNoConfigDomicilio.data.message), 'A_domicilio rechaza monto no configurado -> 400')

  console.log('== "Otro" en A_domicilio SOLO si el total supera la opción más alta ==')
  const cfgOpciones = await req('PATCH', '/api/configuracion', { opcionesCambio: [5, 10] })
  ok(cfgOpciones.status === 200 && JSON.stringify(cfgOpciones.data.opcionesCambio) === JSON.stringify([5, 10]), 'opciones de cambio reducidas a [5,10]')
  // total domicilio = 15 (coca) + 5 (envio) = 20 > 10 -> se permite el monto libre.
  const montoOtroDomicilio = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Monto Otro Domicilio',
    referenciaLibre: 'calle del monto otro 1',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 23, usuarioId: admin.id,
  })
  ok(montoOtroDomicilio.status === 201 && montoOtroDomicilio.data.cambioALlevar === 3, 'A_domicilio acepta monto fuera de opciones cuando el total supera la opción más alta (23 -> cambio 3)')
  // total domicilio = 6 (chicle) <= 10 -> el monto libre NO se permite.
  const chicle = await prisma.producto.create({ data: { nombre: 'Chicle6', precio: 6, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: chicle.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  await req('PATCH', '/api/config/costo-envio', { costoEnvio: 0 })
  const montoOtroRechazado = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Monto Otro Rechazado',
    referenciaLibre: 'calle del monto otro 2',
    productos: [{ productoId: chicle.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 7, usuarioId: admin.id,
  })
  ok(montoOtroRechazado.status === 400 && /opciones de cambio/i.test(montoOtroRechazado.data.message), 'A_domicilio rechaza monto libre cuando el total NO supera la opción más alta -> 400')
  // Restauramos la configuración global para no afectar otras suites.
  await req('PATCH', '/api/configuracion', { opcionesCambio: [50, 100, 200, 500] })
  await req('PATCH', '/api/config/costo-envio', { costoEnvio: 5 })

  console.log('== Devolución excedente rechazada ==')
  const abrir2_ = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrir2_.status === 201, 'reabrir caja para la prueba de devolución')
  const vDev = await req('POST', '/api/ventas', {
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vDev.status === 201 && vDev.data.venta.total === 15, 'venta de prueba (15)')
  const devExceso = await req('POST', '/api/devoluciones', {
    ventaId: vDev.data.venta.id, monto: 20, motivo: 'Otro',
    medioDevolucion: 'Efectivo', usuarioId: admin.id,
  })
  ok(devExceso.status === 400 && /excede/i.test(devExceso.data.message), 'devolución que excede el monto pagado -> 400')
  const devCorrecta = await req('POST', '/api/devoluciones', {
    ventaId: vDev.data.venta.id, monto: 15, motivo: 'Otro',
    medioDevolucion: 'Efectivo', usuarioId: admin.id,
  })
  ok(devCorrecta.status === 201, 'devolución válida por el total -> 201')
  await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })

  console.log('== Cancelar pedido Pagado con devolución del dinero ==')
  const prodRef6 = await prisma.producto.create({ data: { nombre: 'ProdRef6', precio: 25, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: prodRef6.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  const abrirRef = await req('POST', '/api/caja/abrir', { fondoInicial: 100, usuarioId: admin.id })
  ok(abrirRef.status === 201 && abrirRef.data.diaOperativo.estado === 'Abierto', 'abrir caja para cancelaciones con devolución (fondo 100)')

  // Mostrador + Para_recoger cobra al capturar: la Venta se genera al crear y
  // estado_pago queda Pagado.
  const pRef = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'Refund6',
    productos: [{ productoId: prodRef6.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pRef.status === 201 && pRef.data.estadoPago === 'Pagado' && pRef.data.total === 25, 'pedido pagado al capturar (total 25)')
  const ventaRefId = pRef.data.venta.id

  const cancelRef = await req('PATCH', `/api/pedidos/${pRef.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado',
    regresaAInventario: false,
    devolverDinero: true,
    medioDevolucion: 'Efectivo_de_caja',
  })
  ok(cancelRef.status === 200 && cancelRef.data.pedido.estadoPreparacion === 'Cancelado', 'cancelar pedido Pagado con devolución -> Cancelado')
  ok(cancelRef.data.devolucion && cancelRef.data.devolucion.monto === 25, 'respuesta incluye la devolución total por 25')
  const devRef = await prisma.devolucion.findFirst({ where: { ventaId: ventaRefId } })
  ok(
    devRef && devRef.monto === 25 && devRef.motivo === 'Cancelacion_pedido' && devRef.medioDevolucion === 'Efectivo_de_caja' && devRef.regresaAInventario === false,
    'devolución TOTAL con motivo Cancelacion_pedido, medio Efectivo_de_caja y sin regreso a inventario',
  )
  const detalleVentaRef = await req('GET', `/api/ventas/${ventaRefId}`)
  ok(
    detalleVentaRef.status === 200 &&
      (detalleVentaRef.data.devoluciones || []).some((d) => d.id === devRef.id),
    'la devolución queda vinculada a la venta (visible en el detalle del pedido)',
  )
  const reporteDevs = await req('GET', '/api/devoluciones')
  ok(
    reporteDevs.status === 200 &&
      reporteDevs.data.some(
        (d) => d.id === devRef.id && d.monto === 25 && d.motivo === 'Cancelacion_pedido',
      ),
    'Reportes -> Devoluciones: aparece la devolución con motivo Cancelacion_pedido y monto 25',
  )

  console.log('== Cancelar pedido Pagado SIN devolver el dinero ==')
  const pRef2 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'NoRefund6',
    productos: [{ productoId: prodRef6.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pRef2.status === 201 && pRef2.data.estadoPago === 'Pagado', 'segundo pedido pagado al capturar (sin devolver dinero)')
  const cancelNoRef = await req('PATCH', `/api/pedidos/${pRef2.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado',
    regresaAInventario: false,
  })
  ok(cancelNoRef.status === 200 && cancelNoRef.data.pedido.estadoPreparacion === 'Cancelado', 'cancelar sin devolver dinero -> Cancelado')
  ok(cancelNoRef.data.devolucion == null, 'respuesta sin devolución (no se devolvió el dinero)')
  const devNoRef = await prisma.devolucion.findFirst({ where: { ventaId: pRef2.data.venta.id } })
  ok(devNoRef === null, 'NO se genera Devolución al cancelar sin devolver el dinero')

  console.log('== Cierre de caja: la devolución por cancelación resta del efectivo esperado ==')
  const cerrarRef = await req('POST', '/api/caja/cerrar', { efectivoContado: 125, usuarioId: admin.id })
  // esperado = 100 (fondo) + 50 (dos ventas Efectivo) - 25 (devolución Efectivo_de_caja) = 125
  ok(cerrarRef.status === 200 && cerrarRef.data.cierre.efectivoEsperado === 125, 'efectivo esperado = 125 (fondo 100 + ventas 50 - devolución 25)')
  ok(cerrarRef.data.cierre.diferencia === 0, 'diferencia = 0 (contado 125)')
  ok(cerrarRef.data.devolucionesEfectivoCaja === 25, 'resumen de caja reporta 25 de devoluciones en efectivo de caja')

  console.log('== Regresión confirmarPedido: click normal -> 409; solo "Usar lo disponible" -> 201 ==')
  const estReg = await req('GET', '/api/caja/estado')
  if (estReg.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  }
  const abrirReg = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrirReg.status === 201 && abrirReg.data.diaOperativo.estado === 'Abierto', 'abrir caja fresca para la regresión de confirmarPedido')
  const prodReg = await prisma.producto.create({ data: { nombre: 'ProdRegClick', precio: 15, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: prodReg.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  const clickNormal = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'ClickNormal',
    productos: [{ productoId: prodReg.id, cantidad: 2 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(clickNormal.status === 409 && /stock insuficiente|disponible/i.test(clickNormal.data?.message || ''), 'click normal (sin usarDisponible) -> 409: nunca vende con stock insuficiente')
  ok((await stockProducto(prodReg.id)) === 1, 'el click normal NO descontó nada (stock sigue 1)')
  const clickUsar = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'ClickUsar',
    productos: [{ productoId: prodReg.id, cantidad: 2 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usarDisponible: true, usuarioId: admin.id,
  })
  ok(clickUsar.status === 201 && clickUsar.data.estadoPago === 'Pagado', '"Usar lo disponible" (usarDisponible:true) -> 201, vende solo lo que hay')
  ok((await stockProducto(prodReg.id)) === 0, 'descuento topeado a lo disponible: stock 0 (NUNCA negativo)')

  console.log('== SEGURIDAD: precios manipulados en el body SIEMPRE se ignoran ==')
  const estSec6 = await req('GET', '/api/caja/estado')
  if (estSec6.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  }
  const abrirSec6 = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrirSec6.status === 201, 'abrir caja fresca para las pruebas de precio manipulado')

  const secIng6 = await prisma.ingrediente.create({ data: { nombre: 'SecIng6', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: secIng6.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const secProd6 = await prisma.producto.create({ data: { nombre: 'SecProd6', precio: 15, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: secProd6.id, ingredienteId: secIng6.id, cantidad: 1 } })
  const secMod6 = await prisma.modificador.create({
    data: { nombre: 'SecMod6', tipo: 'Agregar', ingredienteAfectadoId: secIng6.id, cantidadExtra: 1, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: secProd6.id, modificadorId: secMod6.id } })
  const secCombo6 = await prisma.combo.create({ data: { nombre: 'SecCombo6', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: secCombo6.id, productoId: secProd6.id, cantidad: 1 } })

  const vSec6 = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd6.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec6.status === 201 && vSec6.data.venta.total === 15 && vSec6.data.venta.productos[0].precioCongelado === 15,
    'venta directa IGNORA precioCongelado:0.01 -> cobra 15 (precio de la BD)')

  const vSec6Mod = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd6.id, cantidad: 1, modificadores: [{ modificadorId: secMod6.id, costoAplicado: 0.01 }] }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec6Mod.status === 201 && vSec6Mod.data.venta.total === 18, 'costoAplicado:0.01 IGNORADO -> costo real 3 (total 18)')

  const vSec6Combo = await req('POST', '/api/ventas', {
    productos: [{ comboId: secCombo6.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec6Combo.status === 201 && vSec6Combo.data.venta.total === 30, 'combo IGNORA precioCongelado:0.01 -> cobra precio especial 30')

  const pSec6 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'SecPedido6',
    productos: [{ productoId: secProd6.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pSec6.status === 201 && pSec6.data.total === 15, 'pedido IGNORA precioCongelado:0.01 al crearse -> total real 15')

  await prisma.producto.update({ where: { id: secProd6.id }, data: { precio: 999 } })
  const pagoSec6 = await req('PATCH', `/api/pedidos/${pSec6.data.id}/estado-pago`, { estadoPago: 'Pagado', precioCongelado: 0.01, usuarioId: admin.id })
  ok(pagoSec6.status === 200 && pagoSec6.data.venta.total === 15,
    'pago de pedido IGNORA precioCongelado:0.01 -> venta respeta el precio CONGELADO en BD (15, no 999)')

  const vSec6Nuevo = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd6.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec6Nuevo.status === 201 && vSec6Nuevo.data.venta.total === 999, 'precio SIEMPRE desde BD: tras subirlo a 999, la nueva venta cobra 999 (no 0.01)')

  console.log(`\nResultado: ${fallas === 0 ? 'TODAS LAS PRUEBAS PASARON' : fallas + ' prueba(s) fallaron'}`)
} catch (e) {
  console.error('ERROR EN PRUEBA:', e)
  fallas++
} finally {
  await prisma.$transaction(async (tx) => {
    await tx.pedido_Producto_Modificador.deleteMany()
    await tx.pedido_Producto_Mitad.deleteMany()
    await tx.pedido_Producto.deleteMany()
    await tx.venta_Producto_Modificador.deleteMany()
    await tx.venta_Producto_Mitad.deleteMany()
    await tx.venta_Producto.deleteMany()
    await tx.pedido.deleteMany()
    await tx.devolucion.deleteMany()
    await tx.venta.deleteMany()
    await tx.movimiento_Inventario.deleteMany()
    await tx.combo_Producto.deleteMany()
    await tx.combo.deleteMany()
    await tx.empleado.deleteMany()
    await tx.cliente_Referencia.deleteMany()
    await tx.cliente.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.configuracion.deleteMany()
    await tx.producto_Modificador.deleteMany()
    await tx.modificador.deleteMany()
    await tx.producto_Ingrediente.deleteMany()
    await tx.producto.deleteMany()
    await tx.ingrediente.deleteMany()
    await tx.gasto.deleteMany()
    await tx.devolucion.deleteMany()
    await tx.usuario.deleteMany()
  })
  await prisma.$disconnect()
}

process.exit(fallas === 0 ? 0 : 1)
