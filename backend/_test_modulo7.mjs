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

  console.log('== Sin token -> 401 ==')
  const sinToken = await req('GET', '/api/pedidos', undefined, null)
  ok(sinToken.status === 401, 'peticion sin token -> 401')

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
