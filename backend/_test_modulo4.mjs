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

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test4', contraseña: 'x' } })

// Datos base
const harina = await prisma.ingrediente.create({
  data: { nombre: 'Harina', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 2 },
})
await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 10 } })

// Ingrediente EXCLUSIVO de la receta del producto base (para comprobar que
// el producto base NO descuenta inventario en mitad y mitad).
const masa = await prisma.ingrediente.create({
  data: { nombre: 'Masa', unidadMedida: 'pieza', stockActual: 100, stockMinimoAlerta: 10 },
})
await prisma.movimiento_Inventario.create({ data: { ingredienteId: masa.id, tipoMovimiento: 'Entrada', cantidad: 100 } })

const torta = await prisma.producto.create({ data: { nombre: 'Torta', precio: 25, tipo: 'Con_receta', permiteMitadYMitad: true } })
await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: harina.id, cantidad: 2 } })
await prisma.producto_Ingrediente.create({ data: { productoId: torta.id, ingredienteId: masa.id, cantidad: 1 } })

const sabor1 = await prisma.producto.create({ data: { nombre: 'Chocolate', precio: 10, tipo: 'Con_receta' } })
await prisma.producto_Ingrediente.create({ data: { productoId: sabor1.id, ingredienteId: harina.id, cantidad: 4 } })
const sabor2 = await prisma.producto.create({ data: { nombre: 'Fresa', precio: 10, tipo: 'Con_receta' } })
await prisma.producto_Ingrediente.create({ data: { productoId: sabor2.id, ingredienteId: harina.id, cantidad: 2 } })

const coca = await prisma.producto.create({ data: { nombre: 'Coca', precio: 15, tipo: 'Reventa_directa' } })

const modificador = await prisma.modificador.create({
  data: { nombre: 'Extra harina', tipo: 'Agregar', ingredienteAfectadoId: harina.id, cantidadExtra: 1, costoAdicional: 2 },
})
await prisma.producto_Modificador.create({ data: { productoId: torta.id, modificadorId: modificador.id } })

const dia = await prisma.dia_Operativo.create({ data: { fondoInicial: 0, estado: 'Abierto', usuarioId: admin.id } })

try {
  console.log('== Ventas ==')
  // A: 2 Torta, consume 4 de Harina (10->6)
  const v1 = await req('POST', '/api/ventas', {
    productos: [{ productoId: torta.id, cantidad: 2 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(v1.status === 201 && v1.data.venta.total === 50, 'venta 2 tortas (total 50)')
  ok(v1.data.movimientosInventario[0].cantidadDescontada === 4, 'descuenta 4 de harina')

  // B = 1 torta + modificador Agregar (2+1=3), 25+2=27 (10-4-3=3)
  const r2 = await req('POST', '/api/ventas', {
    productos: [{ productoId: torta.id, cantidad: 1, modificadores: [{ modificadorId: modificador.id }] }],
    metodoPago: 'Tarjeta',
    usuarioId: admin.id,
  })
  ok(r2.status === 201 && r2.data.venta.total === 27, 'venta con modificador (total 27)')
  ok(r2.data.venta.productos[0].modificadores[0].costoAplicado === 2, 'costoAplicado congelado')

  // C = 2 mitades y mitades: base 1*2 + sabor1 2*2 + sabor2 1*2 = 8; stock=3 -> falta
  const mitadBody = {
    productos: [{
      productoId: torta.id, cantidad: 2, esMitadYMitad: true,
      sabor1ProductoId: sabor1.id, sabor2ProductoId: sabor2.id,
    }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  }
  const r3 = await req('POST', '/api/ventas', mitadBody)
  ok(r3.status === 409 && r3.data.stockInsuficiente[0].id === harina.id && r3.data.stockInsuficiente[0].disponible === 3, 'stock insuficiente -> 409 con disponible 3')

  // D = retry usarDisponible: consume 3 (queda 0)
  const r4 = await req('POST', '/api/ventas', { ...mitadBody, usarDisponible: [harina.id] })
  ok(r4.status === 201 && r4.data.venta.total === 50, 'mit y mil con usarDisponible -> 201 total 50')
  const stockHarina = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina._sum.cantidad === 0, 'harina queda en 0 (no negativo)')

  // El producto base (Torta, cuya receta usa Masa) NO debe descontar inventario
  // en la venta mitad y mitad: su Masa queda intacta (solo se consumió en A y B).
  const stockMasa = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: masa.id } })
  ok(stockMasa._sum.cantidad === 97, 'masa intacta tras mitad y mitad (base no consume)')
  const masaMovsMitad = await prisma.movimiento_Inventario.findMany({ where: { ingredienteId: masa.id, referenciaId: r4.data.venta.id } })
  ok(masaMovsMitad.length === 0, 'producto base no genera movimiento en mitad y mitad')

  // E = entrada 7 harina con costo -> gasto y stock 7
  const e1 = await req('POST', '/api/inventario/entrada', { ingredienteId: harina.id, cantidad: 7, costo: 30, usuarioId: admin.id })
  ok(e1.status === 201 && e1.data.stockActual === 7, 'entrada harina stock 7')
  ok(e1.data.gasto && e1.data.gasto.categoria === 'Insumos' && e1.data.gasto.origen === 'Automatico_por_entrada_inventario', 'gasto autom generado')

  // F = ajuste a 5 (5-7=-2)
  const a1 = await req('POST', '/api/inventario/ajuste', { ingredienteId: harina.id, stockRealContado: 5, motivo: 'Merma', usuarioId: admin.id })
  ok(a1.status === 200 && a1.data.movimiento.cantidad === -2 && a1.data.stockActual === 5, 'ajuste harina a 5 (-2)')

  // G = reventa coca: entrada 10 -> stock 10 -> venta 2 -> 8
  const ec = await req('POST', '/api/inventario/entrada', { productoId: coca.id, cantidad: 10, usuarioId: admin.id })
  ok(ec.status === 201 && ec.data.stockActual === 10, 'entrada producto reventa stock 10')
  const ventaCoca = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 2 }], metodoPago: 'Efectivo', usuarioId: admin.id })
  ok(ventaCoca.status === 201, 'venta reventa directa')
  const stockCoca = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: coca.id } })
  ok(stockCoca._sum.cantidad === 8, 'reventa queda en 8')

  // H = consulta stock listado
  const st = await req('GET', '/api/inventario/stock')
  ok(st.status === 200 && st.data.ingredientes.some((i) => i.nombre === 'Harina' && i.stockActual === 5), 'listado stock harina 5')
  ok(st.data.productos.some((p) => p.nombre === 'Coca' && p.stockActual === 8), 'listado stock coca 8')

  // I = reventa stock insuficiente (coca 8 < 20) -> 409 producto
  const badCoca = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 100 }], metodoPago: 'Efectivo', usuarioId: admin.id })
  ok(badCoca.status === 409 && badCoca.data.stockInsuficiente[0].tipo === 'producto', 'reventa stock insuficiente -> 409')

  // J = sin caja abierta
  await prisma.dia_Operativo.update({ where: { id: dia.id }, data: { estado: 'Cerrado' } })
  const sinCaja = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 1 }], metodoPago: 'Efectivo', usuarioId: admin.id })
  ok(sinCaja.status === 409 && /caja/i.test(sinCaja.data.message), 'venta sin caja abierta -> 409')

  console.log(`\nResultado: ${fallas === 0 ? 'TODAS LAS PRUEBAS PASARON' : fallas + ' prueba(s) fallaron'}`)
} catch (e) {
  console.error('ERROR EN PRUEBA:', e)
  fallas++
} finally {
  await prisma.$transaction(async (tx) => {
    await tx.venta_Producto_Modificador.deleteMany()
    await tx.venta_Producto_Mitad.deleteMany()
    await tx.venta_Producto.deleteMany()
    await tx.venta.deleteMany()
    await tx.movimiento_Inventario.deleteMany()
    await tx.producto_Modificador.deleteMany()
    await tx.modificador.deleteMany()
    await tx.producto_Ingrediente.deleteMany()
    await tx.producto.deleteMany()
    await tx.ingrediente.deleteMany()
    await tx.dia_Operativo.deleteMany()
    await tx.gasto.deleteMany()
    await tx.usuario.deleteMany()
  })
  await prisma.$disconnect()
}

process.exit(fallas === 0 ? 0 : 1)