import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()
const BASE = 'http://localhost:3001'
let fallas = 0

function ok(cond, nombre) {
  if (cond) console.log(`  OK  ${nombre}`)
  else {
    fallas++
    console.log(`FALLA ${nombre}`)
  }
}

async function req(method, path, body, bearer = null) {
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }
  if (bearer) headers.Authorization = `Bearer ${bearer}`
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

async function login(usuario, contraseña) {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario, contraseña }),
  })
  const data = await res.json()
  return { status: res.status, token: data.token, data }
}

async function stockIngrediente(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: id } })
  return agg._sum.cantidad ?? 0
}

async function stockProducto(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: id } })
  return agg._sum.cantidad ?? 0
}

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test7', contraseña: await bcrypt.hash('admin7', 10) } })

const coca = await prisma.producto.create({ data: { nombre: 'Coca7', precio: 15, tipo: 'Reventa_directa' } })
await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })

try {
  console.log('== Login ==')
  const okLogin = await login('admin_test7', 'admin7')
  ok(okLogin.status === 200 && okLogin.token && okLogin.data.usuario.tipo === 'Administrador', 'login admin exitoso con token')
  const tokenAdmin = okLogin.token
  const tokenGuardado = await prisma.usuario.findUnique({ where: { id: admin.id }, select: { tokenSesion: true } })
  ok(tokenGuardado.tokenSesion === tokenAdmin, 'token_sesion guardado en Usuario')

  const malLogin = await login('admin_test7', 'contraseña-incorrecta')
  ok(malLogin.status === 401, 'login fallido -> 401')
  const sinBody = await req('POST', '/api/auth/login', {})
  ok(sinBody.status === 400, 'login sin credenciales -> 400')

  console.log('== Contraseñas hasheadas con bcrypt ==')
  const adminDb = await prisma.usuario.findUnique({ where: { id: admin.id } })
  ok(typeof adminDb.contraseña === 'string' && adminDb.contraseña.startsWith('$2'), 'contraseña del admin guardada como hash bcrypt ($2...)')
  ok(adminDb.contraseña !== 'admin7', 'la contraseña NO se guarda en texto plano')

  console.log('== Configuracion global: opciones de cambio ==')
  const cfgGet = await req('GET', '/api/configuracion', undefined, tokenAdmin)
  ok(cfgGet.status === 200 && Array.isArray(cfgGet.data.opcionesCambio) && cfgGet.data.opcionesCambio.length > 0, 'GET /api/configuracion devuelve opciones de cambio')
  const cfgPatch = await req('PATCH', '/api/configuracion', { opcionesCambio: [20, 50, 100, 200, 500] }, tokenAdmin)
  ok(cfgPatch.status === 200 && JSON.stringify(cfgPatch.data.opcionesCambio) === JSON.stringify([20, 50, 100, 200, 500]), 'PATCH /api/configuracion actualiza opciones de cambio')

  console.log('== Validacion de monto_referencia_pago contra opciones ==')
  const montoInvalido = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Cliente Z',
    referenciaLibre: 'Dirección Z',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 999,
  }, tokenAdmin)
  ok(montoInvalido.status === 400 && /opciones de cambio/i.test(montoInvalido.data.message), 'monto_referencia_pago no configurado -> 400 con error claro')

  console.log('== Alta de repartidores (como admin) ==')
  const r1 = await req('POST', '/api/empleados', { nombre: 'Pedro7', usuario: 'pedro7', contraseña: 'pedro7pass' }, tokenAdmin)
  ok(r1.status === 201 && r1.data.usuario.tipo === 'Repartidor', 'alta repartidor 1 con usuario vinculado')
  const r2 = await req('POST', '/api/empleados', { nombre: 'Luis7', usuario: 'luis7', contraseña: 'luis7pass' }, tokenAdmin)
  ok(r2.status === 201, 'alta repartidor 2')
  const repDb = await prisma.usuario.findUnique({ where: { usuario: 'pedro7' } })
  ok(typeof repDb.contraseña === 'string' && repDb.contraseña.startsWith('$2'), 'contraseña del repartidor (creado por API) guardada hasheada')

  const loginRep = await login('pedro7', 'pedro7pass')
  ok(loginRep.status === 200 && loginRep.data.usuario.tipo === 'Repartidor', 'login repartidor exitoso con token')
  const tokenRep = loginRep.token
  const loginRep2 = await login('luis7', 'luis7pass')
  const tokenRep2 = loginRep2.token

  console.log('== Repartidor inactivo bloqueado al iniciar sesión ==')
  const rInac = await req('POST', '/api/empleados', { nombre: 'Dario7', usuario: 'dario7', contraseña: 'dario7pass' }, tokenAdmin)
  ok(rInac.status === 201, 'alta repartidor para la prueba de inactivo')
  const inac = await req('PATCH', `/api/empleados/${rInac.data.id}`, { estadoDisponibilidad: 'Inactivo' }, tokenAdmin)
  ok(inac.status === 200 && inac.data.estadoDisponibilidad === 'Inactivo', 'repartidor marcado como Inactivo')
  const loginInac = await login('dario7', 'dario7pass')
  ok(loginInac.status === 403, 'login de repartidor Inactivo -> 403')
  ok(/inactiva/i.test(loginInac.data?.message || ''), 'mensaje de error claro: cuenta inactiva')
  const loginInacMala = await login('dario7', 'contraseña-incorrecta')
  ok(loginInacMala.status === 401, 'repartidor Inactivo con contraseña incorrecta -> 401 (no filtra estado)')

  console.log('== Repartidor bloqueado en endpoints de Administrador ==')
  const bloqueoIngredientes = await req('GET', '/api/ingredientes', undefined, tokenRep)
  ok(bloqueoIngredientes.status === 403, 'repartidor -> GET ingredientes 403')
  const bloqueoProductos = await req('GET', '/api/productos', undefined, tokenRep)
  ok(bloqueoProductos.status === 403, 'repartidor -> GET productos 403')
  const bloqueoInventario = await req('POST', '/api/inventario/entrada', { productoId: coca.id, cantidad: 1 }, tokenRep)
  ok(bloqueoInventario.status === 403, 'repartidor -> entrada inventario 403')
  const bloqueoCaja = await req('GET', '/api/caja/estado', undefined, tokenRep)
  ok(bloqueoCaja.status === 403, 'repartidor -> caja 403')
  const bloqueoGastos = await req('POST', '/api/gastos', { concepto: 'x', monto: 1, categoria: 'Otro', metodoPago: 'Efectivo' }, tokenRep)
  ok(bloqueoGastos.status === 403, 'repartidor -> registrar gasto 403')
  const bloqueoDevoluciones = await req('POST', '/api/devoluciones', {}, tokenRep)
  ok(bloqueoDevoluciones.status === 403, 'repartidor -> devolucion 403')
  const bloqueoClientes = await req('POST', '/api/clientes', { nombre: 'Cliente' }, tokenRep)
  ok(bloqueoClientes.status === 403, 'repartidor -> alta cliente 403')
  const bloqueoEmpleados = await req('POST', '/api/empleados', { nombre: 'X', usuario: 'x', contraseña: 'xxx' }, tokenRep)
  ok(bloqueoEmpleados.status === 403, 'repartidor -> alta repartidor 403')
  const bloqueoPedidos = await req('GET', '/api/pedidos', undefined, tokenRep)
  ok(bloqueoPedidos.status === 403, 'repartidor -> ver todos los pedidos 403')
  const bloqueoConfig = await req('PATCH', '/api/configuracion', { opcionesCambio: [50] }, tokenRep)
  ok(bloqueoConfig.status === 403, 'repartidor -> modificar configuración 403')

  console.log('== Repartidor no puede tomar pedidos normales ==')
  const tomarPedido = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 50,
  }, tokenRep)
  ok(tomarPedido.status === 403, 'repartidor -> tomar pedido normal 403')

  console.log('== Repartidor con "No cobrar" en pedido a domicilio ==')
  const pedidoNoCobrar = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Cliente',
    referenciaLibre: 'Dirección NC',
    productos: [{ productoId: coca.id, cantidad: 1 }], noCobrar: true,
  }, tokenRep)
  ok(pedidoNoCobrar.status === 201 && pedidoNoCobrar.data.noCobrar === true, 'repartidor -> pedido A_domicilio No cobrar 201')

  console.log('== Pedido asignado al repartidor (admin marca Enviado) ==')
  const p = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Cliente X',
    referenciaLibre: 'Dirección Cliente X',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 20,
  }, tokenAdmin)
  ok(p.status === 201 && p.data.estadoPago === 'Pendiente_pago', 'admin crea pedido A_domicilio (Pendiente_pago)')
  // Secuencia estricta: Pendiente -> En_preparacion -> Enviado (docs/06).
  const prepP = await req('PATCH', `/api/pedidos/${p.data.id}/estado-preparacion`, { estadoPreparacion: 'En_preparacion' }, tokenAdmin)
  ok(prepP.status === 200, 'admin pasa el pedido a En_preparacion')
  const enviado = await req('PATCH', `/api/pedidos/${p.data.id}/estado-preparacion`, { estadoPreparacion: 'Enviado', repartidorId: r1.data.id }, tokenAdmin)
  ok(enviado.status === 200 && enviado.data.pedido.repartidorId === r1.data.id, 'admin asigna repartidor 1 al marcar Enviado')

  console.log('== Repartidor ve SOLO sus pedidos ==')
  const propios = await req('GET', `/api/pedidos/repartidor/${r1.data.id}`, undefined, tokenRep)
  ok(propios.status === 200 && propios.data.some((x) => x.id === p.data.id), 'repartidor ve su pedido asignado')
  const ajenos = await req('GET', `/api/pedidos/repartidor/${r2.data.id}`, undefined, tokenRep)
  ok(ajenos.status === 403, 'repartidor intenta ver pedidos de otro repartidor -> 403')

  console.log('== Repartidor marca Entregado su propio pedido ==')
  const entregado = await req('PATCH', `/api/pedidos/${p.data.id}/estado-preparacion`, { estadoPreparacion: 'Entregado' }, tokenRep)
  ok(entregado.status === 200 && entregado.data.pedido.estadoPreparacion === 'Entregado', 'repartidor marca su pedido Entregado')

  const noEntregado = await req('PATCH', `/api/pedidos/${pedidoNoCobrar.data.id}/estado-preparacion`, { estadoPreparacion: 'En_preparacion' }, tokenRep)
  ok(noEntregado.status === 403, 'repartidor NO puede cambiar a En_preparacion -> 403')

  const ajenoEntregado = await req('PATCH', `/api/pedidos/${pedidoNoCobrar.data.id}/estado-preparacion`, { estadoPreparacion: 'Entregado' }, tokenRep2)
  ok(ajenoEntregado.status === 403, 'repartidor 2 no puede marcar Entregado pedido de repartidor 1 -> 403')

  console.log('== Repartidor y "No cobrar" en ventas ==')
  const abrir = await req('POST', '/api/caja/abrir', { fondoInicial: 100 }, tokenAdmin)
  ok(abrir.status === 201, 'admin abre caja')
  const ventaNoCobrar = await req('POST', '/api/ventas', {
    productos: [{ productoId: coca.id, cantidad: 1 }], noCobrar: true, usuarioId: 999999,
  }, tokenRep)
  ok(ventaNoCobrar.status === 201 && ventaNoCobrar.data.venta.noCobrar === true, 'repartidor registra venta No cobrar')
  ok(ventaNoCobrar.data.venta.usuarioId === loginRep.data.usuario.id, 'usuarioId falso en body es ignorado: auditoría registra el usuario real del token')
  const ventaNormal = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 1 }], metodoPago: 'Efectivo' }, tokenRep)
  ok(ventaNormal.status === 403, 'repartidor NO puede registrar venta normal (sin No cobrar) -> 403')

  console.log('== Reportes de ventas solo Administrador ==')
  const ventasComoRep = await req('GET', '/api/ventas', undefined, tokenRep)
  ok(ventasComoRep.status === 403, 'repartidor -> GET /api/ventas 403')
  const ncComoRep = await req('GET', '/api/ventas/no-cobrar', undefined, tokenRep)
  ok(ncComoRep.status === 403, 'repartidor -> GET /api/ventas/no-cobrar 403')
  const ventasComoAdmin = await req('GET', '/api/ventas', undefined, tokenAdmin)
  ok(ventasComoAdmin.status === 200 && Array.isArray(ventasComoAdmin.data) && ventasComoAdmin.data.length >= 1, 'admin -> GET /api/ventas 200 con ventas')
  const ncComoAdmin = await req('GET', '/api/ventas/no-cobrar', undefined, tokenAdmin)
  ok(ncComoAdmin.status === 200 && ncComoAdmin.data.some((v) => v.id === ventaNoCobrar.data.venta.id && Array.isArray(v.productos) && v.productos[0].producto && typeof v.productos[0].costo === 'number' && v.usuario), 'admin -> GET /api/ventas/no-cobrar 200 (producto, costo, usuario)')

  console.log('== Repartidor marca "No cobrar" al entregar ==')
  const pedidoEntregaNC = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'NC Entrega',
    referenciaLibre: 'Dirección NC Entrega',
    productos: [{ productoId: coca.id, cantidad: 1 }], noCobrar: true,
  }, tokenRep)
  ok(pedidoEntregaNC.status === 201 && pedidoEntregaNC.data.noCobrar === true && pedidoEntregaNC.data.estadoPago === 'Pendiente_pago' && pedidoEntregaNC.data.venta === null, 'repartidor crea pedido No cobrar (Pendiente_pago, sin venta aún)')
  // Secuencia estricta: Pendiente -> En_preparacion -> Enviado (docs/06).
  const prepNC = await req('PATCH', `/api/pedidos/${pedidoEntregaNC.data.id}/estado-preparacion`, { estadoPreparacion: 'En_preparacion' }, tokenAdmin)
  ok(prepNC.status === 200, 'admin pasa el pedido NC a En_preparacion')
  const enviadoNC = await req('PATCH', `/api/pedidos/${pedidoEntregaNC.data.id}/estado-preparacion`, { estadoPreparacion: 'Enviado', repartidorId: r1.data.id }, tokenAdmin)
  ok(enviadoNC.status === 200 && enviadoNC.data.pedido.repartidorId === r1.data.id, 'admin asigna repartidor 1 al pedido NC')
  const entregaNC = await req('PATCH', `/api/pedidos/${pedidoEntregaNC.data.id}/estado-preparacion`, { estadoPreparacion: 'Entregado', noCobrar: true }, tokenRep)
  ok(entregaNC.status === 200 && entregaNC.data.pedido.estadoPreparacion === 'Entregado', 'repartidor marca Entregado con noCobrar')
  ok(entregaNC.data.pedido.noCobrar === true, 'pedido queda noCobrar=true')
  ok(entregaNC.data.pedido.estadoPago === 'Pagado', 'pedido pasa a Pagado sin que un admin ejecute estado_pago aparte')
  ok(entregaNC.data.venta && entregaNC.data.venta.noCobrar === true, 'venta generada automáticamente como noCobrar=true')
  ok(entregaNC.data.pedido.ventaId === entregaNC.data.venta.id, 'pedido.ventaId apunta a la venta generada')

  // Entregado SIN noCobrar en un pedido Pendiente_pago: no genera venta.
  const pedidoSinNC = await req('POST', '/api/pedidos', {
    tipo: 'A_domicilio', origen: 'Telefono', nombreClienteLibre: 'Sin NC',
    referenciaLibre: 'Dirección Sin NC',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 20,
  }, tokenAdmin)
  ok(pedidoSinNC.status === 201 && pedidoSinNC.data.estadoPago === 'Pendiente_pago', 'admin crea pedido A_domicilio (Pendiente_pago)')
  // Secuencia estricta: Pendiente -> En_preparacion -> Enviado (docs/06).
  await req('PATCH', `/api/pedidos/${pedidoSinNC.data.id}/estado-preparacion`, { estadoPreparacion: 'En_preparacion' }, tokenAdmin)
  await req('PATCH', `/api/pedidos/${pedidoSinNC.data.id}/estado-preparacion`, { estadoPreparacion: 'Enviado', repartidorId: r1.data.id }, tokenAdmin)
  const entregaSin = await req('PATCH', `/api/pedidos/${pedidoSinNC.data.id}/estado-preparacion`, { estadoPreparacion: 'Entregado' }, tokenRep)
  ok(entregaSin.status === 200 && entregaSin.data.venta === undefined, 'Entregado sin noCobrar NO genera venta')
  ok(entregaSin.data.pedido.estadoPago === 'Pendiente_pago', 'pedido sigue Pendiente_pago al entregar sin noCobrar')

  console.log('== Repartidor cobra SU pedido a domicilio (flujo unificado) ==')
  // pedidoSinNC quedó Entregado+Pendiente_pago: el mismo Repartidor que lo
  // entregó lo cobra ahora (docs/07: el repartidor recibe el dinero en la
  // entrega). Ya no requiere 2 pasos separados ni depender del Administrador.
  const ajenoPago = await req('PATCH', `/api/pedidos/${pedidoSinNC.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenRep2)
  ok(ajenoPago.status === 403, 'repartidor NO puede cobrar pedido de otro repartidor -> 403')
  const propioPago = await req('PATCH', `/api/pedidos/${pedidoSinNC.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenRep)
  ok(
    propioPago.status === 200 &&
      propioPago.data.pedido.estadoPreparacion === 'Entregado' &&
      propioPago.data.pedido.estadoPago === 'Pagado',
    'flujo unificado: el repartidor entrega y cobra su pedido (Entregado + Pagado) sin admin'
  )
  ok(propioPago.data.venta && propioPago.data.venta.noCobrar === false && propioPago.data.venta.total === pedidoSinNC.data.total, 'venta generada por el repartidor al cobrar (total del pedido, sin noCobrar)')

  console.log('== Número de pedido en el reporte coincide con el panel ==')
  // El panel principal muestra "Pedido #<pedido.id>". El reporte de ventas no
  // debe mostrar un "Venta #X" distinto: el identificador que se ve debe ser
  // EXACTAMENTE el mismo número de pedido (venta.pedidoId === pedido.id).
  ok(
    propioPago.data.venta.pedidoId === pedidoSinNC.data.id,
    `la venta generada queda vinculada al pedido #${pedidoSinNC.data.id} (venta.pedidoId === pedido.id)`
  )
  const repVentas = await req('GET', '/api/ventas', undefined, tokenAdmin)
  const filaReporte = (repVentas.data || []).find((v) => v.id === propioPago.data.venta.id)
  ok(
    filaReporte && filaReporte.pedidoId === pedidoSinNC.data.id,
    'reporte de ventas expone el mismo número de pedido del panel para esa venta'
  )

  console.log('== Repartidor NO puede cobrar un Para_recoger (sin repartidor) ==')
  const pRecoger = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Cli Recoger',
    productos: [{ productoId: coca.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 20,
  }, tokenAdmin)
  ok(pRecoger.status === 201 && pRecoger.data.estadoPago === 'Pendiente_pago', 'admin crea pedido Para_recoger (Pendiente_pago)')
  const pagoRecogerRep = await req('PATCH', `/api/pedidos/${pRecoger.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenRep)
  ok(pagoRecogerRep.status === 403, 'repartidor NO puede cobrar un pedido Para_recoger -> 403')
  const pagoRecogerAdmin = await req('PATCH', `/api/pedidos/${pRecoger.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenAdmin)
  ok(pagoRecogerAdmin.status === 200 && pagoRecogerAdmin.data.pedido.estadoPago === 'Pagado', 'Administrador sigue pudiendo cobrar cualquier pedido (Para_recoger)')

  console.log('== Pedido con combo + modificador Agregar/Sustituir: reserva al CREAR (admin) ==')
  const ingAg7 = await prisma.ingrediente.create({ data: { nombre: 'IngAg7', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingAg7.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const extraAg7 = await prisma.ingrediente.create({ data: { nombre: 'ExtraAg7', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: extraAg7.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodAg7 = await prisma.producto.create({ data: { nombre: 'ProdAg7', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodAg7.id, ingredienteId: ingAg7.id, cantidad: 1 } })
  const modAg7 = await prisma.modificador.create({
    data: { nombre: 'ModAgregar7', tipo: 'Agregar', ingredienteAfectadoId: extraAg7.id, cantidadExtra: 2, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodAg7.id, modificadorId: modAg7.id } })
  const comboAg7 = await prisma.combo.create({ data: { nombre: 'ComboAg7', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboAg7.id, productoId: prodAg7.id, cantidad: 1 } })

  const stockIngAg7_0 = await stockIngrediente(ingAg7.id)
  const stockExtraAg7_0 = await stockIngrediente(extraAg7.id)
  const pComboAg7 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Agregar 7',
    productos: [{ comboId: comboAg7.id, cantidad: 2, productos: [{ productoId: prodAg7.id, modificadores: [{ modificadorId: modAg7.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
  }, tokenAdmin)
  ok(pComboAg7.status === 201 && pComboAg7.data.estadoPago === 'Pendiente_pago', 'pedido combo+Agregar -> Pendiente_pago')
  ok((await stockIngrediente(ingAg7.id)) === stockIngAg7_0 - 2, 'reserva al CREAR descuenta la receta base del combo (1x2)')
  ok((await stockIngrediente(extraAg7.id)) === stockExtraAg7_0 - 4, 'reserva al CREAR descuenta el extra del modificador Agregar (2x2)')
  const pagarComboAg7 = await req('PATCH', `/api/pedidos/${pComboAg7.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenAdmin)
  ok(pagarComboAg7.status === 200, 'pago del combo+Agregar')
  ok(pComboAg7.data.total === 66, 'pedido combo+Agregar -> total 66 ((30 base + 3 extra) x2)')
  ok(pagarComboAg7.data.venta.total === 66, 'pago del combo+Agregar -> venta 66 (el Agregar SÍ suma al precio)')
  ok(
    pComboAg7.data.productos.every((pp) => pp.comboPrecioCongelado === 33),
    'precio del combo congelado en 33 (base 30 + extra 3)',
  )
  ok((await stockIngrediente(ingAg7.id)) === stockIngAg7_0 - 2, 'pagar NO vuelve a descontar la receta (reserva ya hecha)')
  ok((await stockIngrediente(extraAg7.id)) === stockExtraAg7_0 - 4, 'pagar NO vuelve a descontar el extra (reserva ya hecha)')

  const ingA7 = await prisma.ingrediente.create({ data: { nombre: 'IngA7', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingA7.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const ingB7 = await prisma.ingrediente.create({ data: { nombre: 'IngB7', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingB7.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodS7 = await prisma.producto.create({ data: { nombre: 'ProdS7', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodS7.id, ingredienteId: ingA7.id, cantidad: 1 } })
  const modS7 = await prisma.modificador.create({
    data: { nombre: 'ModSustituir7', tipo: 'Sustituir', ingredienteAfectadoId: ingA7.id, ingredienteSustitutoId: ingB7.id, cantidadSustituto: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodS7.id, modificadorId: modS7.id } })
  const comboS7 = await prisma.combo.create({ data: { nombre: 'ComboS7', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboS7.id, productoId: prodS7.id, cantidad: 1 } })

  const stockIngA7_0 = await stockIngrediente(ingA7.id)
  const stockIngB7_0 = await stockIngrediente(ingB7.id)
  const pComboS7 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Sustituir 7',
    productos: [{ comboId: comboS7.id, cantidad: 1, productos: [{ productoId: prodS7.id, modificadores: [{ modificadorId: modS7.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
  }, tokenAdmin)
  ok(pComboS7.status === 201 && pComboS7.data.estadoPago === 'Pendiente_pago', 'pedido combo+Sustituir -> Pendiente_pago')
  ok((await stockIngrediente(ingA7.id)) === stockIngA7_0, 'reserva al CREAR NO descuenta el ingrediente afectado A (se elimina de la receta)')
  ok((await stockIngrediente(ingB7.id)) === stockIngB7_0 - 3, 'reserva al CREAR descuenta el sustituto B (cantidadSustituto 3)')
  const pagarComboS7 = await req('PATCH', `/api/pedidos/${pComboS7.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenAdmin)
  ok(pagarComboS7.status === 200, 'pago del combo+Sustituir')
  ok((await stockIngrediente(ingB7.id)) === stockIngB7_0 - 3, 'pagar NO vuelve a descontar el sustituto (reserva ya hecha)')

  console.log('== Pedido viejo sin reserva: al pagarse valida stock (no descuenta a ciegas) ==')
  // Simula un pedido creado ANTES del rediseño de reserva (commit 2f87347):
  // se borran sus movimientos de reserva y el stock del ingrediente ya se
  // consumió en otra venta. Al pagarse se valida el stock como una venta
  // normal: 409 con faltantes y, con usarDisponible, descuento topeado (nunca
  // negativo).
  const ingR7 = await prisma.ingrediente.create({ data: { nombre: 'IngR7', unidadMedida: 'kg', stockActual: 1, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR7.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  const prodR7 = await prisma.producto.create({ data: { nombre: 'ProdR7', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodR7.id, ingredienteId: ingR7.id, cantidad: 1 } })
  const pR7 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Viejo sin reserva 7',
    productos: [{ productoId: prodR7.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
  }, tokenAdmin)
  ok(pR7.status === 201 && pR7.data.estadoPago === 'Pendiente_pago', 'pedido creado Pendiente_pago (con reserva)')
  ok((await stockIngrediente(ingR7.id)) === 0, 'reserva al crear: stock 1 - 1 = 0')
  const borradosR7 = await prisma.movimiento_Inventario.deleteMany({
    where: { pedidoProductoId: { in: pR7.data.productos.map((x) => x.id) }, ventaProductoId: null },
  })
  ok(borradosR7.count > 0, 'reserva eliminada -> el pedido simula ser pre-rediseño (sin movimientos)')
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR7.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  ok((await stockIngrediente(ingR7.id)) === 0, 'el ingrediente ya se consumió en otra venta (disponible 0)')
  const pagoViejoR7 = await req('PATCH', `/api/pedidos/${pR7.data.id}/estado-pago`, { estadoPago: 'Pagado' }, tokenAdmin)
  ok(pagoViejoR7.status === 409, 'pagar pedido viejo sin stock -> 409 (NO descuenta a ciegas)')
  ok(
    Array.isArray(pagoViejoR7.data?.stockInsuficiente) &&
      pagoViejoR7.data.stockInsuficiente.some((f) => f.id === ingR7.id && f.requerido === 1 && f.disponible === 0),
    '409 reporta el faltante (requerido 1, disponible 0)'
  )
  ok((await stockIngrediente(ingR7.id)) === 0, 'sin usarDisponible el stock sigue 0 (nada descontado)')
  const pagoViejoR7Usar = await req('PATCH', `/api/pedidos/${pR7.data.id}/estado-pago`, { estadoPago: 'Pagado', usarDisponible: true }, tokenAdmin)
  ok(pagoViejoR7Usar.status === 200 && pagoViejoR7Usar.data.pedido?.estadoPago === 'Pagado', 'con usarDisponible:true el pago procede ("Usar lo disponible")')
  ok((await stockIngrediente(ingR7.id)) === 0, 'descuento topeado a lo disponible: stock 0 (NUNCA negativo)')

  console.log('== Sin token -> 401 ==')
  const sinToken = await req('GET', '/api/pedidos', undefined, null)
  ok(sinToken.status === 401, 'peticion sin token -> 401')

  console.log('== Cancelar pedido Pagado en Efectivo: devolución con medio Efectivo_de_caja ==')
  const estRefund = await req('GET', '/api/caja/estado', undefined, tokenAdmin)
  if (estRefund.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id }, tokenAdmin)
  }
  const abrirRefund = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id }, tokenAdmin)
  ok(abrirRefund.status === 201 && abrirRefund.data.diaOperativo.estado === 'Abierto', 'abrir caja fresca (fondo 0) para el caso de devolución')
  const prodRefund = await prisma.producto.create({ data: { nombre: 'ProdRefund', precio: 20, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: prodRefund.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  const pRefund = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'RefundCash',
    productos: [{ productoId: prodRefund.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  }, tokenAdmin)
  ok(pRefund.status === 201 && pRefund.data.estadoPago === 'Pagado' && pRefund.data.total === 20, 'pedido de Mostrador pagado al capturar (total 20)')
  const cancelRefund = await req('PATCH', `/api/pedidos/${pRefund.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado', regresaAInventario: false, devolverDinero: true, medioDevolucion: 'Efectivo_de_caja',
  }, tokenAdmin)
  ok(cancelRefund.status === 200 && cancelRefund.data.pedido.estadoPreparacion === 'Cancelado', 'cancelar pedido Pagado con devolución -> Cancelado')
  ok(cancelRefund.data.devolucion && cancelRefund.data.devolucion.monto === 20 && cancelRefund.data.devolucion.medioDevolucion === 'Efectivo_de_caja', 'devolución por 20 con medio Efectivo_de_caja')
  const devRefund = await prisma.devolucion.findFirst({ where: { ventaId: pRefund.data.venta.id } })
  ok(devRefund && devRefund.monto === 20 && devRefund.medioDevolucion === 'Efectivo_de_caja' && devRefund.motivo === 'Cancelacion_pedido', 'Devolución guardada: motivo Cancelacion_pedido, medio Efectivo_de_caja, monto 20')
  const cerrarRefund = await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id }, tokenAdmin)
  ok(cerrarRefund.status === 200 && cerrarRefund.data.cierre.efectivoEsperado === 0, 'efectivo esperado = 0 (venta 20 - devolución Efectivo_de_caja 20)')
  ok(cerrarRefund.data.devolucionesEfectivoCaja === 20, 'resumen de caja reporta 20 en "Devoluciones en efectivo"')
  ok(cerrarRefund.data.cierre.diferencia === 0, 'diferencia = 0 (contado 0)')

  console.log('== Regresión confirmarPedido: click normal -> 409; solo "Usar lo disponible" -> 201 ==')
  const estReg = await req('GET', '/api/caja/estado', undefined, tokenAdmin)
  if (estReg.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id }, tokenAdmin)
  }
  const abrirReg = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id }, tokenAdmin)
  ok(abrirReg.status === 201 && abrirReg.data.diaOperativo.estado === 'Abierto', 'abrir caja fresca para la regresión de confirmarPedido')
  const prodReg = await prisma.producto.create({ data: { nombre: 'ProdRegClick', precio: 15, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: prodReg.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  const clickNormal = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'ClickNormal',
    productos: [{ productoId: prodReg.id, cantidad: 2 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  }, tokenAdmin)
  ok(clickNormal.status === 409 && /stock insuficiente|disponible/i.test(clickNormal.data?.message || ''), 'click normal (sin usarDisponible) -> 409: nunca vende con stock insuficiente')
  ok((await stockProducto(prodReg.id)) === 1, 'el click normal NO descontó nada (stock sigue 1)')
  const clickUsar = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'ClickUsar',
    productos: [{ productoId: prodReg.id, cantidad: 2 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usarDisponible: true, usuarioId: admin.id,
  }, tokenAdmin)
  ok(clickUsar.status === 201 && clickUsar.data.estadoPago === 'Pagado', '"Usar lo disponible" (usarDisponible:true) -> 201, vende solo lo que hay')
  ok((await stockProducto(prodReg.id)) === 0, 'descuento topeado a lo disponible: stock 0 (NUNCA negativo)')

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
    await tx.empleado.deleteMany()
    await tx.cliente_Referencia.deleteMany()
    await tx.cliente.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.configuracion.deleteMany()
    await tx.combo_Producto.deleteMany()
    await tx.combo.deleteMany()
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
