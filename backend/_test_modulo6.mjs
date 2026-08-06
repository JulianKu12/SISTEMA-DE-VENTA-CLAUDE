import { PrismaClient } from '@prisma/client'

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

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test6', contraseña: 'x' } })

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
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(p2.status === 201 && p2.data.estadoPago === 'Pendiente_pago', 'Mostrador+A_domicilio -> Pendiente_pago')
  ok(p2.data.costoEnvio === 5 && p2.data.total === 20, 'costo_envio 5 aplicado (total 20)')
  ok(p2.data.venta === null, 'aun sin venta')
  ok((await stockProducto(coca.id)) === 8, 'stock intacto mientras no se paga')

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
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Transferencia',
    usuarioId: admin.id,
  })
  ok(p4.status === 201 && p4.data.estadoPago === 'Pendiente_pago', 'Telefono+A_domicilio -> Pendiente_pago')
  ok(p4.data.total === 20 && p4.data.costoEnvio === 5, 'total 20 con envio')

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

  console.log('== Pago diferido (P2) ==')
  const pagar2 = await req('PATCH', `/api/pedidos/${p2.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagar2.status === 200 && pagar2.data.pedido.estadoPago === 'Pagado', 'P2 pasa a Pagado')
  ok(pagar2.data.venta && pagar2.data.venta.total === 20, 'venta generada con total 20 (incluye envio)')
  ok((await stockProducto(coca.id)) === 7, 'stock coca 8->7 tras pago de P2')

  console.log('== Asignacion de repartidor (P4, repartidor unico activo) ==')
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
  ok((await stockProducto(coca.id)) === 8, 'combo descuenta reventa (coca 9->8)')
  const stockHarina6 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina6._sum.cantidad === 8, 'combo descuenta receta (harina 10->8)')

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
  const pagarCombo2 = await req('PATCH', `/api/pedidos/${pCombo2.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarCombo2.status === 200 && pagarCombo2.data.venta.total === 35, 'pago diferido del combo -> venta total 35')
  ok((await stockProducto(coca.id)) === 7, 'coca 8->7 tras pagar combo diferido')
  const stockHarina7 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina7._sum.cantidad === 6, 'harina 8->6 tras pagar combo diferido')

  console.log('== Drift de receta: cancelación revierte EXACTO (no recalcula) ==')
  const pDrift = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador',
    productos: [{ productoId: torta.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pDrift.status === 201 && pDrift.data.estadoPago === 'Pagado', 'pedido torta pagado al capturar')
  const stockHarina8 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina8._sum.cantidad === 4, 'torta consume 2 harina (6->4)')
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
  ok(stockHarina9._sum.cantidad === 6, 'se revierte EXACTO (2, no la receta nueva de 5) -> harina 6')

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
