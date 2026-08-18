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

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test5', contraseña: await bcrypt.hash('x', 10) } })

async function loginAdmin() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test5', contraseña: 'x' }),
  })
  const data = await res.json()
  token = data.token
  return res.status
}

const coca = await prisma.producto.create({ data: { nombre: 'Coca', precio: 15, tipo: 'Reventa_directa' } })
const agua = await prisma.producto.create({ data: { nombre: 'Agua', precio: 10, tipo: 'Reventa_directa' } })
await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
await prisma.movimiento_Inventario.create({ data: { productoId: agua.id, tipoMovimiento: 'Entrada', cantidad: 10 } })

try {
  console.log('== Autenticación ==')
  ok((await loginAdmin()) === 200, 'login admin')

  console.log('== Gasto sin caja abierta ==')
  const g1 = await req('POST', '/api/gastos', {
    concepto: 'Focos', monto: 20, categoria: 'Otro', metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(g1.status === 201 && g1.data.gasto.diaOperativoId === null, 'gasto sin caja -> 201 con diaOperativoId null')
  ok(g1.data.asociadoASiguienteDia === true, 'marca asociadoASiguienteDia')

  console.log('== Abrir caja 1 con venta previa ==')
  const abrir1 = await req('POST', '/api/caja/abrir', {
    fondoInicial: 100,
    usuarioId: admin.id,
    ventasPrevias: [{ productos: [{ productoId: coca.id, cantidad: 2 }], metodoPago: 'Efectivo' }],
  })
  ok(abrir1.status === 201 && abrir1.data.diaOperativo.estado === 'Abierto', 'abrir caja 1 -> 201 Abierto')
  ok(abrir1.data.ventasPreviasRegistradas.length === 1 && abrir1.data.ventasPreviasRegistradas[0].esVentaPreviaApertura === true, 'venta previa con es_venta_previa_apertura=true')
  ok(abrir1.data.gastosAsociados === 1, 'gasto sin caja asociado al nuevo dia')
  ok((await stockProducto(coca.id)) === 8, 'venta previa descontó inventario (coca 10->8)')
  const gastoAsociado = await prisma.gasto.findUnique({ where: { id: g1.data.gasto.id } })
  ok(gastoAsociado.diaOperativoId === abrir1.data.diaOperativo.id, 'el gasto apunta al dia 1')

  const est = await req('GET', '/api/caja/estado')
  ok(est.status === 200 && est.data.abierta === true && est.data.dia.fondoInicial === 100, 'estado -> abierta con fondo 100')
  const abrir2 = await req('POST', '/api/caja/abrir', { fondoInicial: 5, usuarioId: admin.id })
  ok(abrir2.status === 409, 'abrir con caja ya abierta -> 409')

  console.log('== Ventas normales en dia abierto ==')
  const vEfectivo = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 1 }], metodoPago: 'Efectivo', usuarioId: admin.id })
  ok(vEfectivo.status === 201 && vEfectivo.data.venta.total === 15, 'venta efectivo (15)')
  const vTarjeta = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 1 }], metodoPago: 'Tarjeta', usuarioId: admin.id })
  ok(vTarjeta.status === 201 && vTarjeta.data.venta.total === 15, 'venta tarjeta (15)')

  console.log('== Devolucion completa con regreso a inventario ==')
  const dev1 = await req('POST', '/api/devoluciones', {
    ventaId: vEfectivo.data.venta.id, monto: 15, motivo: 'Producto_mal_estado',
    medioDevolucion: 'Efectivo_de_caja', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(dev1.status === 201 && dev1.data.devolucion.medioPagoOriginal === 'Efectivo', 'devolucion con medio_pago_original heredado')
  ok(dev1.data.movimientosRegreso === 1, 'devolucion completa genera 1 movimiento')
  ok((await stockProducto(coca.id)) === 7, 'inventario regresado (coca 7)')

  const rep = await req('GET', '/api/devoluciones')
  ok(
    rep.status === 200 && rep.data.length === 1 &&
      rep.data[0].productos[0].producto === 'Coca' && rep.data[0].productos[0].costo === 15 &&
      rep.data[0].medioPagoOriginal === 'Efectivo' && rep.data[0].medioDevolucion === 'Efectivo_de_caja',
    'reporte devoluciones: producto, costo, medio original y medio de devolucion'
  )

  console.log('== Devolución duplicada/excedente rechazada ==')
  const devRepetida = await req('POST', '/api/devoluciones', {
    ventaId: vEfectivo.data.venta.id, monto: 15, motivo: 'Otro',
    medioDevolucion: 'Efectivo_de_caja', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(devRepetida.status === 400 && /excede/i.test(devRepetida.data.message), 'devolución de una venta ya devuelta -> 400 (excede)')

  console.log('== Cierre caja 1 ==')
  const cerrar1 = await req('POST', '/api/caja/cerrar', { efectivoContado: 80, usuarioId: admin.id })
  // esperado = 100 + 15 (efectivo) - 20 (gasto) - 15 (devolucion Efectivo_de_caja) = 80
  ok(cerrar1.status === 200 && cerrar1.data.cierre.efectivoEsperado === 80, 'efectivo esperado = 80 (venta previa no cuenta)')
  ok(cerrar1.data.cierre.diferencia === 0, 'diferencia = 0')
  ok(cerrar1.data.ventas.efectivo === 15 && cerrar1.data.ventas.tarjeta === 15, 'ventas: efectivo 15, tarjeta 15 (informativo)')
  ok(cerrar1.data.diaOperativo.estado === 'Cerrado', 'dia 1 marcado Cerrado')

  console.log('== Devolucion sin caja abierta (post-cierre) ==')
  const devSinCaja = await req('POST', '/api/devoluciones', {
    ventaId: vTarjeta.data.venta.id, monto: 5, motivo: 'Otro',
    medioDevolucion: 'Efectivo', regresaAInventario: false, usuarioId: admin.id,
  })
  ok(devSinCaja.status === 201 && devSinCaja.data.devolucion.diaOperativoId === null, 'devolucion sin caja -> 201 con diaOperativoId null')
  ok(devSinCaja.data.asociadaASiguienteDia === true, 'marca asociadaASiguienteDia')

  console.log('== Abrir caja 2 asocia devolucion huerfana ==')
  const abrir3 = await req('POST', '/api/caja/abrir', { fondoInicial: 50, usuarioId: admin.id })
  ok(abrir3.status === 201 && abrir3.data.devolucionesAsociadas === 1, 'abrir caja 2 asocia la devolucion sin caja')
  const devAsoc = await prisma.devolucion.findUnique({ where: { id: devSinCaja.data.devolucion.id } })
  ok(devAsoc.diaOperativoId === abrir3.data.diaOperativo.id, 'la devolucion huerfana apunta al dia 2')

  console.log('== Venta de 2 productos (para devolucion parcial) ==')
  const v2 = await req('POST', '/api/ventas', {
    productos: [
      { productoId: coca.id, cantidad: 1 },
      { productoId: agua.id, cantidad: 1 },
    ],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(v2.status === 201 && v2.data.venta.total === 25, 'venta 2 productos (25)')
  ok((await stockProducto(coca.id)) === 6 && (await stockProducto(agua.id)) === 9, 'coca 6, agua 9 tras la venta')
  const vpCoca = v2.data.venta.productos.find((vp) => vp.productoId === coca.id)
  const vpAgua = v2.data.venta.productos.find((vp) => vp.productoId === agua.id)

  console.log('== Devolucion PARCIAL: solo coca ==')
  const devParcial = await req('POST', '/api/devoluciones', {
    ventaId: v2.data.venta.id, ventaProductoIds: [vpCoca.id], monto: 15, motivo: 'Cliente_insatisfecho',
    medioDevolucion: 'Efectivo', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(devParcial.status === 201 && devParcial.data.movimientosRegreso === 1, 'devolucion parcial genera 1 movimiento (solo coca)')
  ok((await stockProducto(coca.id)) === 7, 'solo coca regresa (6->7)')
  ok((await stockProducto(agua.id)) === 9, 'agua permanece consumida (9)')
  const movParcial = await prisma.movimiento_Inventario.findMany({ where: { referenciaId: devParcial.data.devolucion.id, tipoMovimiento: 'Devolucion_regreso' } })
  ok(movParcial.length === 1 && movParcial[0].productoId === coca.id && movParcial[0].cantidad === 1, 'movimiento Devolucion_regreso apunta a coca con cantidad 1')
  const malParcial = await req('POST', '/api/devoluciones', {
    ventaId: v2.data.venta.id, ventaProductoIds: [999999], monto: 1, motivo: 'Otro',
    medioDevolucion: 'Efectivo', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(malParcial.status === 400, 'ventaProductoIds ajeno a la venta -> 400')

  console.log('== Devolución parcial duplicada / excedente rechazada ==')
  const devDuelParcial = await req('POST', '/api/devoluciones', {
    ventaId: v2.data.venta.id, ventaProductoIds: [vpCoca.id], monto: 10, motivo: 'Otro',
    medioDevolucion: 'Efectivo', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(devDuelParcial.status === 400 && /ya fue devuelto/i.test(devDuelParcial.data.message), 'producto ya devuelto -> 400 (duplicada)')
  const devExceso = await req('POST', '/api/devoluciones', {
    ventaId: v2.data.venta.id, monto: 99, motivo: 'Otro',
    medioDevolucion: 'Efectivo', usuarioId: admin.id,
  })
  ok(devExceso.status === 400 && /excede/i.test(devExceso.data.message), 'devolución que excede el monto pagado -> 400')

  console.log('== Devolución restante (lo que falta de la venta) ==')
  const devRestante = await req('POST', '/api/devoluciones', {
    ventaId: v2.data.venta.id, ventaProductoIds: [vpAgua.id], monto: 10, motivo: 'Otro',
    medioDevolucion: 'Efectivo', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(devRestante.status === 201 && devRestante.data.movimientosRegreso === 1, 'devolución restante genera 1 movimiento (solo agua)')
  ok((await stockProducto(coca.id)) === 7 && (await stockProducto(agua.id)) === 10, 'agua regresada (9->10), coca sin cambios (7)')

  console.log('== Devolución PARCIAL POR CANTIDAD (10 de 20, luego 15 rechazada) ==')
  const papas = await prisma.producto.create({ data: { nombre: 'Papas', precio: 10, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: papas.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const v20 = await req('POST', '/api/ventas', {
    productos: [{ productoId: papas.id, cantidad: 20 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(v20.status === 201 && v20.data.venta.total === 200, 'venta de 20 unidades en una sola línea (200)')
  ok((await stockProducto(papas.id)) === 80, 'papas 100 -> 80 tras la venta')
  const vpPapas = v20.data.venta.productos[0]

  const dev10 = await req('POST', '/api/devoluciones', {
    ventaId: v20.data.venta.id,
    ventaProductoIds: [vpPapas.id],
    cantidades: { [vpPapas.id]: 10 },
    monto: 100,
    motivo: 'Cliente_insatisfecho',
    medioDevolucion: 'Efectivo',
    regresaAInventario: true,
    usuarioId: admin.id,
  })
  ok(dev10.status === 201, 'devolver 10 de 20 -> 201')
  ok(
    dev10.data.devolucion.cantidadesVentaProducto &&
      JSON.parse(dev10.data.devolucion.cantidadesVentaProducto)[vpPapas.id] === 10,
    'la devolución guarda la cantidad parcial (10)',
  )
  ok(dev10.data.movimientosRegreso === 1, 'regreso proporcional genera 1 movimiento')
  const mvDev10 = await prisma.movimiento_Inventario.findFirst({
    where: { referenciaId: dev10.data.devolucion.id, tipoMovimiento: 'Devolucion_regreso' },
  })
  ok(mvDev10 && mvDev10.cantidad === 10, 'el regreso es proporcional (+10 de los 20, no +20)')
  ok((await stockProducto(papas.id)) === 90, 'papas 80 -> 90 tras devolver 10')

  const dev15 = await req('POST', '/api/devoluciones', {
    ventaId: v20.data.venta.id,
    ventaProductoIds: [vpPapas.id],
    cantidades: { [vpPapas.id]: 15 },
    monto: 150,
    motivo: 'Otro',
    medioDevolucion: 'Efectivo',
    regresaAInventario: true,
    usuarioId: admin.id,
  })
  ok(dev15.status === 400 && /Solo quedan 10/i.test(dev15.data.message || ''), 'devolver 15 cuando solo quedan 10 -> 400 (excede el remanente)')
  ok((await stockProducto(papas.id)) === 90, 'papas se mantienen en 90 (el rechazo no regresa nada)')

  const dev10mas = await req('POST', '/api/devoluciones', {
    ventaId: v20.data.venta.id,
    ventaProductoIds: [vpPapas.id],
    cantidades: { [vpPapas.id]: 10 },
    monto: 100,
    motivo: 'Otro',
    medioDevolucion: 'Efectivo',
    regresaAInventario: true,
    usuarioId: admin.id,
  })
  ok(dev10mas.status === 201 && dev10mas.data.movimientosRegreso === 1, 'devolver los 10 restantes -> 201 con su movimiento')
  ok((await stockProducto(papas.id)) === 100, 'papas vuelven a 100 tras devolver las 20 (10+10)')

  const repPapas = await req('GET', '/api/devoluciones')
  const filasPapas = repPapas.data.filter((d) => d.ventaId === v20.data.venta.id)
  ok(
    filasPapas.length === 2 &&
      filasPapas[0].productos[0].producto === 'Papas' && filasPapas[0].productos[0].cantidad === 10 &&
      filasPapas[1].productos[0].producto === 'Papas' && filasPapas[1].productos[0].cantidad === 10,
    'reporte devoluciones refleja la cantidad devuelta de cada registro (10 y 10)',
  )

  console.log('== Cierre caja 2 ==')
  // esperado = 50 + 25 (venta de 2 productos) + 200 (venta de 20 papas) = 275
  // (devoluciones con medio Efectivo/Tarjeta no restan del efectivo esperado)
  const cerrar2 = await req('POST', '/api/caja/cerrar', { efectivoContado: 275, usuarioId: admin.id })
  ok(cerrar2.status === 200 && cerrar2.data.cierre.efectivoEsperado === 275 && cerrar2.data.cierre.diferencia === 0, 'cierre 2: esperado 275, diferencia 0')

  const hist = await req('GET', '/api/caja/historial')
  ok(hist.status === 200 && hist.data.length === 2 && hist.data.every((d) => d.diferencia === 0), 'historial con 2 dias cerrados')
  const gastosDia1 = await req('GET', `/api/gastos?diaOperativoId=${abrir1.data.diaOperativo.id}`)
  ok(gastosDia1.status === 200 && gastosDia1.data.some((g) => g.id === g1.data.gasto.id), 'listar gastos filtrado por dia')

  console.log('== Venta previa con modificador "Quitar" no descuenta el ingrediente ==')
  const harinaQ = await prisma.ingrediente.create({
    data: { nombre: 'Harina quitada', unidadMedida: 'kg', stockActual: 5, stockMinimoAlerta: 1 },
  })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harinaQ.id, tipoMovimiento: 'Entrada', cantidad: 5 } })
  const tortaQ = await prisma.producto.create({ data: { nombre: 'Torta sin harina', precio: 25, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: tortaQ.id, ingredienteId: harinaQ.id, cantidad: 2 } })
  const modQuitar = await prisma.modificador.create({
    data: { nombre: 'Quitar harina', tipo: 'Quitar', ingredienteAfectadoId: harinaQ.id },
  })
  await prisma.producto_Modificador.create({ data: { productoId: tortaQ.id, modificadorId: modQuitar.id } })

  const abrirQuitar = await req('POST', '/api/caja/abrir', {
    fondoInicial: 0,
    usuarioId: admin.id,
    ventasPrevias: [{
      productos: [{ productoId: tortaQ.id, cantidad: 1, modificadores: [{ modificadorId: modQuitar.id }] }],
      metodoPago: 'Efectivo',
    }],
  })
  ok(abrirQuitar.status === 201 && abrirQuitar.data.ventasPreviasRegistradas.length === 1, 'abrir caja con venta previa con modificador Quitar -> 201')
  const ventaQuitar = abrirQuitar.data.ventasPreviasRegistradas[0]
  ok(ventaQuitar.esVentaPreviaApertura === true, 'la venta previa con modificador queda marcada como previa a apertura')
  ok(ventaQuitar.productos[0].modificadores[0].modificador.nombre === 'Quitar harina', 'la venta previa registra el modificador Quitar')
  const stockHarinaQ = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harinaQ.id } })
  ok(stockHarinaQ._sum.cantidad === 5, 'el ingrediente afectado por Quitar NO se descuenta (sigue en 5)')
  const movQuitar = await prisma.movimiento_Inventario.findMany({
    where: { ingredienteId: harinaQ.id, tipoMovimiento: 'Salida_venta', referenciaId: ventaQuitar.id },
  })
  ok(movQuitar.length === 0, 'no existe movimiento Salida_venta del ingrediente quitado')
  const cerrarQuitar = await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  ok(cerrarQuitar.status === 200 && cerrarQuitar.data.cierre.diferencia === 0, 'cierre de la caja con venta previa Quitar (esperado 0)')

  console.log('== Pedido con combo + modificador Agregar/Sustituir: reserva al CREAR ==')
  const abrirCaja5 = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrirCaja5.status === 201, 'abrir caja para probar pago de pedidos')

  const ingAg5 = await prisma.ingrediente.create({ data: { nombre: 'IngAg5', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingAg5.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const extraAg5 = await prisma.ingrediente.create({ data: { nombre: 'ExtraAg5', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: extraAg5.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodAg5 = await prisma.producto.create({ data: { nombre: 'ProdAg5', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodAg5.id, ingredienteId: ingAg5.id, cantidad: 1 } })
  const modAg5 = await prisma.modificador.create({
    data: { nombre: 'ModAgregar5', tipo: 'Agregar', ingredienteAfectadoId: extraAg5.id, cantidadExtra: 2, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodAg5.id, modificadorId: modAg5.id } })
  const comboAg5 = await prisma.combo.create({ data: { nombre: 'ComboAg5', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboAg5.id, productoId: prodAg5.id, cantidad: 1 } })

  const stockIngAg5_0 = await stockIngrediente(ingAg5.id)
  const stockExtraAg5_0 = await stockIngrediente(extraAg5.id)
  const pComboAg5 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Agregar 5',
    productos: [{ comboId: comboAg5.id, cantidad: 2, productos: [{ productoId: prodAg5.id, modificadores: [{ modificadorId: modAg5.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pComboAg5.status === 201 && pComboAg5.data.estadoPago === 'Pendiente_pago', 'pedido combo+Agregar -> Pendiente_pago')
  ok((await stockIngrediente(ingAg5.id)) === stockIngAg5_0 - 2, 'reserva al CREAR descuenta la receta base del combo (1x2)')
  ok((await stockIngrediente(extraAg5.id)) === stockExtraAg5_0 - 4, 'reserva al CREAR descuenta el extra del modificador Agregar (2x2)')
  const pagarComboAg5 = await req('PATCH', `/api/pedidos/${pComboAg5.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarComboAg5.status === 200, 'pago del combo+Agregar')
  ok(pComboAg5.data.total === 66, 'pedido combo+Agregar -> total 66 ((30 base + 3 extra) x2)')
  ok(pagarComboAg5.data.venta.total === 66, 'pago del combo+Agregar -> venta 66 (el Agregar SÍ suma al precio)')
  ok(
    pComboAg5.data.productos.every((pp) => pp.comboPrecioCongelado === 33),
    'precio del combo congelado en 33 (base 30 + extra 3)',
  )
  ok((await stockIngrediente(ingAg5.id)) === stockIngAg5_0 - 2, 'pagar NO vuelve a descontar la receta (reserva ya hecha)')
  ok((await stockIngrediente(extraAg5.id)) === stockExtraAg5_0 - 4, 'pagar NO vuelve a descontar el extra (reserva ya hecha)')

  const ingA5 = await prisma.ingrediente.create({ data: { nombre: 'IngA5', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingA5.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const ingB5 = await prisma.ingrediente.create({ data: { nombre: 'IngB5', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingB5.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodS5 = await prisma.producto.create({ data: { nombre: 'ProdS5', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodS5.id, ingredienteId: ingA5.id, cantidad: 1 } })
  const modS5 = await prisma.modificador.create({
    data: { nombre: 'ModSustituir5', tipo: 'Sustituir', ingredienteAfectadoId: ingA5.id, ingredienteSustitutoId: ingB5.id, cantidadSustituto: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodS5.id, modificadorId: modS5.id } })
  const comboS5 = await prisma.combo.create({ data: { nombre: 'ComboS5', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboS5.id, productoId: prodS5.id, cantidad: 1 } })

  const stockIngA5_0 = await stockIngrediente(ingA5.id)
  const stockIngB5_0 = await stockIngrediente(ingB5.id)
  const pComboS5 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Sustituir 5',
    productos: [{ comboId: comboS5.id, cantidad: 1, productos: [{ productoId: prodS5.id, modificadores: [{ modificadorId: modS5.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pComboS5.status === 201 && pComboS5.data.estadoPago === 'Pendiente_pago', 'pedido combo+Sustituir -> Pendiente_pago')
  ok((await stockIngrediente(ingA5.id)) === stockIngA5_0, 'reserva al CREAR NO descuenta el ingrediente afectado A (se elimina de la receta)')
  ok((await stockIngrediente(ingB5.id)) === stockIngB5_0 - 3, 'reserva al CREAR descuenta el sustituto B (cantidadSustituto 3)')
  const pagarComboS5 = await req('PATCH', `/api/pedidos/${pComboS5.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarComboS5.status === 200, 'pago del combo+Sustituir')
  ok((await stockIngrediente(ingB5.id)) === stockIngB5_0 - 3, 'pagar NO vuelve a descontar el sustituto (reserva ya hecha)')

  console.log('== Pedido viejo sin reserva: al pagarse valida stock (no descuenta a ciegas) ==')
  // Simula un pedido creado ANTES del rediseño de reserva (commit 2f87347):
  // se borran sus movimientos de reserva y el stock del ingrediente ya se
  // consumió en otra venta. Al pagarse se valida el stock como una venta
  // normal: 409 con faltantes y, con usarDisponible, descuento topeado (nunca
  // negativo).
  const ingR5 = await prisma.ingrediente.create({ data: { nombre: 'IngR5', unidadMedida: 'kg', stockActual: 1, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR5.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  const prodR5 = await prisma.producto.create({ data: { nombre: 'ProdR5', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodR5.id, ingredienteId: ingR5.id, cantidad: 1 } })
  const pR5 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Viejo sin reserva 5',
    productos: [{ productoId: prodR5.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pR5.status === 201 && pR5.data.estadoPago === 'Pendiente_pago', 'pedido creado Pendiente_pago (con reserva)')
  ok((await stockIngrediente(ingR5.id)) === 0, 'reserva al crear: stock 1 - 1 = 0')
  const borradosR5 = await prisma.movimiento_Inventario.deleteMany({
    where: { pedidoProductoId: { in: pR5.data.productos.map((x) => x.id) }, ventaProductoId: null },
  })
  ok(borradosR5.count > 0, 'reserva eliminada -> el pedido simula ser pre-rediseño (sin movimientos)')
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR5.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  ok((await stockIngrediente(ingR5.id)) === 0, 'el ingrediente ya se consumió en otra venta (disponible 0)')
  const pagoViejoR5 = await req('PATCH', `/api/pedidos/${pR5.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagoViejoR5.status === 409, 'pagar pedido viejo sin stock -> 409 (NO descuenta a ciegas)')
  ok(
    Array.isArray(pagoViejoR5.data?.stockInsuficiente) &&
      pagoViejoR5.data.stockInsuficiente.some((f) => f.id === ingR5.id && f.requerido === 1 && f.disponible === 0),
    '409 reporta el faltante (requerido 1, disponible 0)'
  )
  ok((await stockIngrediente(ingR5.id)) === 0, 'sin usarDisponible el stock sigue 0 (nada descontado)')
  const pagoViejoR5Usar = await req('PATCH', `/api/pedidos/${pR5.data.id}/estado-pago`, { estadoPago: 'Pagado', usarDisponible: true, usuarioId: admin.id })
  ok(pagoViejoR5Usar.status === 200 && pagoViejoR5Usar.data.pedido?.estadoPago === 'Pagado', 'con usarDisponible:true el pago procede ("Usar lo disponible")')
  ok((await stockIngrediente(ingR5.id)) === 0, 'descuento topeado a lo disponible: stock 0 (NUNCA negativo)')

  console.log('== Cancelar pedido Pagado en Efectivo: devolución con medio Efectivo_de_caja ==')
  const estRefund = await req('GET', '/api/caja/estado')
  if (estRefund.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  }
  const abrirRefund = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrirRefund.status === 201 && abrirRefund.data.diaOperativo.estado === 'Abierto', 'abrir caja fresca (fondo 0) para el caso de devolución')
  const prodRefund = await prisma.producto.create({ data: { nombre: 'ProdRefund', precio: 20, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: prodRefund.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  const pRefund = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Mostrador', nombreClienteLibre: 'RefundCash',
    productos: [{ productoId: prodRefund.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pRefund.status === 201 && pRefund.data.estadoPago === 'Pagado' && pRefund.data.total === 20, 'pedido de Mostrador pagado al capturar (total 20)')
  const cancelRefund = await req('PATCH', `/api/pedidos/${pRefund.data.id}/estado-preparacion`, {
    estadoPreparacion: 'Cancelado', regresaAInventario: false, devolverDinero: true, medioDevolucion: 'Efectivo_de_caja',
  })
  ok(cancelRefund.status === 200 && cancelRefund.data.pedido.estadoPreparacion === 'Cancelado', 'cancelar pedido Pagado con devolución -> Cancelado')
  ok(cancelRefund.data.devolucion && cancelRefund.data.devolucion.monto === 20 && cancelRefund.data.devolucion.medioDevolucion === 'Efectivo_de_caja', 'devolución por 20 con medio Efectivo_de_caja')
  const devRefund = await prisma.devolucion.findFirst({ where: { ventaId: pRefund.data.venta.id } })
  ok(devRefund && devRefund.monto === 20 && devRefund.medioDevolucion === 'Efectivo_de_caja' && devRefund.motivo === 'Cancelacion_pedido', 'Devolución guardada: motivo Cancelacion_pedido, medio Efectivo_de_caja, monto 20')
  const cerrarRefund = await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  ok(cerrarRefund.status === 200 && cerrarRefund.data.cierre.efectivoEsperado === 0, 'efectivo esperado = 0 (venta 20 - devolución Efectivo_de_caja 20)')
  ok(cerrarRefund.data.devolucionesEfectivoCaja === 20, 'resumen de caja reporta 20 en "Devoluciones en efectivo"')
  ok(cerrarRefund.data.cierre.diferencia === 0, 'diferencia = 0 (contado 0)')

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
  const estSec5 = await req('GET', '/api/caja/estado')
  if (estSec5.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  }
  const abrirSec5 = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrirSec5.status === 201, 'abrir caja fresca para las pruebas de precio manipulado')

  const secIng5 = await prisma.ingrediente.create({ data: { nombre: 'SecIng5', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: secIng5.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const secProd5 = await prisma.producto.create({ data: { nombre: 'SecProd5', precio: 15, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: secProd5.id, ingredienteId: secIng5.id, cantidad: 1 } })
  const secMod5 = await prisma.modificador.create({
    data: { nombre: 'SecMod5', tipo: 'Agregar', ingredienteAfectadoId: secIng5.id, cantidadExtra: 1, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: secProd5.id, modificadorId: secMod5.id } })
  const secCombo5 = await prisma.combo.create({ data: { nombre: 'SecCombo5', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: secCombo5.id, productoId: secProd5.id, cantidad: 1 } })

  const vSec5 = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd5.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec5.status === 201 && vSec5.data.venta.total === 15 && vSec5.data.venta.productos[0].precioCongelado === 15,
    'venta directa IGNORA precioCongelado:0.01 -> cobra 15 (precio de la BD)')

  const vSec5Mod = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd5.id, cantidad: 1, modificadores: [{ modificadorId: secMod5.id, costoAplicado: 0.01 }] }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec5Mod.status === 201 && vSec5Mod.data.venta.total === 18, 'costoAplicado:0.01 IGNORADO -> costo real 3 (total 18)')

  const vSec5Combo = await req('POST', '/api/ventas', {
    productos: [{ comboId: secCombo5.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec5Combo.status === 201 && vSec5Combo.data.venta.total === 30, 'combo IGNORA precioCongelado:0.01 -> cobra precio especial 30')

  const pSec5 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'SecPedido5',
    productos: [{ productoId: secProd5.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pSec5.status === 201 && pSec5.data.total === 15, 'pedido IGNORA precioCongelado:0.01 al crearse -> total real 15')

  await prisma.producto.update({ where: { id: secProd5.id }, data: { precio: 999 } })
  const pagoSec5 = await req('PATCH', `/api/pedidos/${pSec5.data.id}/estado-pago`, { estadoPago: 'Pagado', precioCongelado: 0.01, usuarioId: admin.id })
  ok(pagoSec5.status === 200 && pagoSec5.data.venta.total === 15,
    'pago de pedido IGNORA precioCongelado:0.01 -> venta respeta el precio CONGELADO en BD (15, no 999)')

  const vSec5Nuevo = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd5.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec5Nuevo.status === 201 && vSec5Nuevo.data.venta.total === 999, 'precio SIEMPRE desde BD: tras subirlo a 999, la nueva venta cobra 999 (no 0.01)')

  console.log(`\nResultado: ${fallas === 0 ? 'TODAS LAS PRUEBAS PASARON' : fallas + ' prueba(s) fallaron'}`)
} catch (e) {
  console.error('ERROR EN PRUEBA:', e)
  fallas++
} finally {
  await prisma.$transaction(async (tx) => {
    await tx.devolucion.deleteMany()
    await tx.venta_Producto_Modificador.deleteMany()
    await tx.venta_Producto_Mitad.deleteMany()
    await tx.venta_Producto.deleteMany()
    await tx.venta.deleteMany()
    await tx.pedido_Producto_Modificador.deleteMany()
    await tx.pedido_Producto_Mitad.deleteMany()
    await tx.pedido_Producto.deleteMany()
    await tx.pedido.deleteMany()
    await tx.movimiento_Inventario.deleteMany()
    await tx.gasto.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.combo_Producto.deleteMany()
    await tx.combo.deleteMany()
    await tx.producto_Modificador.deleteMany()
    await tx.modificador.deleteMany()
    await tx.producto_Ingrediente.deleteMany()
    await tx.producto.deleteMany()
    await tx.ingrediente.deleteMany()
    await tx.usuario.deleteMany()
  })
  await prisma.$disconnect()
}

process.exit(fallas === 0 ? 0 : 1)