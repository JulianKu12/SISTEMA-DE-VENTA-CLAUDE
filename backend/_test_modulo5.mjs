import { PrismaClient } from '@prisma/client'

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

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
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

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test5', contraseña: 'x' } })

const coca = await prisma.producto.create({ data: { nombre: 'Coca', precio: 15, tipo: 'Reventa_directa' } })
const agua = await prisma.producto.create({ data: { nombre: 'Agua', precio: 10, tipo: 'Reventa_directa' } })
await prisma.movimiento_Inventario.create({ data: { productoId: coca.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
await prisma.movimiento_Inventario.create({ data: { productoId: agua.id, tipoMovimiento: 'Entrada', cantidad: 10 } })

try {
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

  console.log('== Cierre caja 1 ==')
  const cerrar1 = await req('POST', '/api/caja/cerrar', { efectivoContado: 80, usuarioId: admin.id })
  // esperado = 100 + 15 (efectivo) - 20 (gasto) - 15 (devolucion Efectivo_de_caja) = 80
  ok(cerrar1.status === 200 && cerrar1.data.cierre.efectivoEsperado === 80, 'efectivo esperado = 80 (venta previa no cuenta)')
  ok(cerrar1.data.cierre.diferencia === 0, 'diferencia = 0')
  ok(cerrar1.data.ventas.efectivo === 15 && cerrar1.data.ventas.tarjeta === 15, 'ventas: efectivo 15, tarjeta 15 (informativo)')
  ok(cerrar1.data.diaOperativo.estado === 'Cerrado', 'dia 1 marcado Cerrado')

  console.log('== Devolucion sin caja abierta (post-cierre) ==')
  const devSinCaja = await req('POST', '/api/devoluciones', {
    ventaId: vEfectivo.data.venta.id, monto: 5, motivo: 'Otro',
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

  console.log('== Devolucion completa (sin venta_producto_ids) ==')
  const devCompleta = await req('POST', '/api/devoluciones', {
    ventaId: v2.data.venta.id, monto: 25, motivo: 'Otro',
    medioDevolucion: 'Tarjeta', regresaAInventario: true, usuarioId: admin.id,
  })
  ok(devCompleta.status === 201 && devCompleta.data.movimientosRegreso === 2, 'devolucion completa regresa los 2 productos')
  ok((await stockProducto(coca.id)) === 8 && (await stockProducto(agua.id)) === 10, 'coca 8 y agua 10 tras regreso completo')

  console.log('== Cierre caja 2 ==')
  // esperado = 50 + 25 (venta efectivo de 2 productos) = 75 (devoluciones con medio Efectivo/Tarjeta no restan)
  const cerrar2 = await req('POST', '/api/caja/cerrar', { efectivoContado: 75, usuarioId: admin.id })
  ok(cerrar2.status === 200 && cerrar2.data.cierre.efectivoEsperado === 75 && cerrar2.data.cierre.diferencia === 0, 'cierre 2: esperado 75, diferencia 0')

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