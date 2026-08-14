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
    await tx.movimiento_Inventario.deleteMany()
    await tx.gasto.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.producto.deleteMany()
    await tx.ingrediente.deleteMany()
    await tx.usuario.deleteMany()
  })
  await prisma.$disconnect()
}

process.exit(fallas === 0 ? 0 : 1)