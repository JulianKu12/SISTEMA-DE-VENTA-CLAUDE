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

async function stockIngrediente(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: id } })
  return agg._sum.cantidad ?? 0
}

async function stockProducto(id) {
  const agg = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: id } })
  return agg._sum.cantidad ?? 0
}

const admin = await prisma.usuario.create({ data: { tipo: 'Administrador', usuario: 'admin_test4', contraseña: await bcrypt.hash('x', 10) } })

async function loginAdmin() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'admin_test4', contraseña: 'x' }),
  })
  const data = await res.json()
  token = data.token
  return res.status
}

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
  console.log('== Autenticación ==')
  ok((await loginAdmin()) === 200, 'login admin')

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
  ok(r4.status === 201 && r4.data.venta.total === 20, 'mit y mil con usarDisponible -> 201 total 20 (10 por unidad = round(10/2+10/2))')
  const stockHarina = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarina._sum.cantidad === 0, 'harina queda en 0 (no negativo)')

  // El producto base (Torta, cuya receta usa Masa) NO debe descontar inventario
  // en la venta mitad y mitad: su Masa queda intacta (solo se consumió en A y B).
  const stockMasa = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: masa.id } })
  ok(stockMasa._sum.cantidad === 97, 'masa intacta tras mitad y mitad (base no consume)')
  const masaMovsMitad = await prisma.movimiento_Inventario.findMany({ where: { ingredienteId: masa.id, referenciaId: r4.data.venta.id } })
  ok(masaMovsMitad.length === 0, 'producto base no genera movimiento en mitad y mitad')

  console.log('== Precio mitad y mitad = suma de mitades de los sabores (redondeada) ==')
  // Sabores con precios DISTINTOS: 45 y 40 -> (45+40)/2 = 42.5 -> 43.
  const saborCarne = await prisma.producto.create({ data: { nombre: 'Torta de jamón', precio: 45, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: saborCarne.id, ingredienteId: harina.id, cantidad: 1 } })
  const saborQueso = await prisma.producto.create({ data: { nombre: 'Torta de queso', precio: 40, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: saborQueso.id, ingredienteId: harina.id, cantidad: 1 } })
  // El producto "base" tiene un precio fijo absurdo (999): si el flujo lo usara,
  // el total no sería 43. Su receta vacía garantiza que NO consume inventario.
  const baseMitad = await prisma.producto.create({
    data: { nombre: 'Torta mitad', precio: 999, tipo: 'Con_receta', permiteMitadYMitad: true },
  })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 2 } })

  const vMitad = await req('POST', '/api/ventas', {
    productos: [{
      productoId: baseMitad.id, cantidad: 1, esMitadYMitad: true,
      sabor1ProductoId: saborCarne.id, sabor2ProductoId: saborQueso.id,
    }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vMitad.status === 201 && vMitad.data.venta.total === 43, 'mitad y mitad = round(45/2 + 40/2) = 43 (NO el precio fijo 999 del base)')
  const vpMitad = vMitad.data.venta.productos[0]
  ok(vpMitad.precioCongelado === 43, 'Venta_Producto.precioCongelado congelado en 43')

  // Cambiar después el precio de los sabores NO afecta la venta ya realizada.
  await prisma.producto.update({ where: { id: saborCarne.id }, data: { precio: 100 } })
  await prisma.producto.update({ where: { id: saborQueso.id }, data: { precio: 1 } })
  const vpMitadDb = await prisma.venta_Producto.findUnique({ where: { id: vpMitad.id } })
  ok(vpMitadDb.precioCongelado === 43, 'cambio posterior al precio de los sabores NO afecta la venta (sigue 43)')
  ok(vMitad.data.venta.total === 43, 'total de la venta previa sigue congelado en 43')

  // Nueva venta con los NUEVOS precios de los sabores: round(100/2 + 1/2) = 51.
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harina.id, tipoMovimiento: 'Entrada', cantidad: 2 } })
  const vMitad2 = await req('POST', '/api/ventas', {
    productos: [{
      productoId: baseMitad.id, cantidad: 1, esMitadYMitad: true,
      sabor1ProductoId: saborCarne.id, sabor2ProductoId: saborQueso.id,
    }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vMitad2.status === 201 && vMitad2.data.venta.total === 51, 'nueva venta tras el cambio de precios recalcula con los nuevos (51)')

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

  console.log('== Sustituir: descuento usa cantidadSustituto ==')
  const sal = await prisma.ingrediente.create({ data: { nombre: 'Sal', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: sal.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  const chipotle = await prisma.ingrediente.create({ data: { nombre: 'Chipotle', unidadMedida: 'pieza', stockActual: 10, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: chipotle.id, tipoMovimiento: 'Entrada', cantidad: 10 } })

  // Unidades DISTINTAS (kg vs pieza): el checkbox de "misma cantidad" no está
  // disponible, la cantidad se indica manualmente (2) y la venta la debe usar.
  const tortaSal = await prisma.producto.create({ data: { nombre: 'Tortasal', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: tortaSal.id, ingredienteId: sal.id, cantidad: 1 } })

  const mSubV1 = await req('POST', '/api/modificadores', {
    nombre: 'Sal por chipotle',
    tipo: 'Sustituir',
    ingredienteAfectadoId: sal.id,
    ingredienteSustitutoId: chipotle.id,
    cantidadSustituto: 2,
  })
  ok(mSubV1.status === 201 && mSubV1.data.cantidadSustituto === 2, 'crear Sustituir (kg a pieza) con cantidad manual 2')
  await prisma.producto_Modificador.create({ data: { productoId: tortaSal.id, modificadorId: mSubV1.data.id } })
  const vSub = await req('POST', '/api/ventas', {
    productos: [{ productoId: tortaSal.id, cantidad: 1, modificadores: [{ modificadorId: mSubV1.data.id }] }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vSub.status === 201, 'venta con modificador Sustituir')
  const stockSal = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: sal.id } })
  ok(stockSal._sum.cantidad === 10, 'el ingrediente afectado NO se descuenta (se elimina, queda 10)')
  const stockChipotle = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: chipotle.id } })
  ok(stockChipotle._sum.cantidad === 8, 'el sustituto se descuenta con cantidadSustituto (10 - 2 = 8), no con la cantidad de la receta (1)')

  // Unidades IGUALES (kg vs kg): la receta pedía 1 de HarinaA, el sustituto se
  // descuenta con la cantidadSustituto elegida (0.5), NO con la de la receta.
  const harinaA = await prisma.ingrediente.create({ data: { nombre: 'HarinaA', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harinaA.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  const harinaB = await prisma.ingrediente.create({ data: { nombre: 'HarinaB', unidadMedida: 'kg', stockActual: 10, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: harinaB.id, tipoMovimiento: 'Entrada', cantidad: 10 } })
  const tortaMix = await prisma.producto.create({ data: { nombre: 'Tortamix', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: tortaMix.id, ingredienteId: harinaA.id, cantidad: 1 } })
  const mSubV2 = await req('POST', '/api/modificadores', {
    nombre: 'HarinaA por HarinaB',
    tipo: 'Sustituir',
    ingredienteAfectadoId: harinaA.id,
    ingredienteSustitutoId: harinaB.id,
    cantidadSustituto: 0.5,
  })
  ok(mSubV2.status === 201, 'crear Sustituir con unidades iguales')
  await prisma.producto_Modificador.create({ data: { productoId: tortaMix.id, modificadorId: mSubV2.data.id } })
  const vSub2 = await req('POST', '/api/ventas', {
    productos: [{ productoId: tortaMix.id, cantidad: 1, modificadores: [{ modificadorId: mSubV2.data.id }] }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vSub2.status === 201, 'venta Sustituir con unidades iguales')
  const stockHarinaB = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harinaB.id } })
  ok(stockHarinaB._sum.cantidad === 9.5, 'sustituto se descuenta 0.5 (cantidad elegida), no 1 (cantidad original de la receta)')

  console.log('== Venta de combos ==')
  const combo = await prisma.combo.create({ data: { nombre: 'Combo Clasico', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: torta.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: combo.id, productoId: coca.id, cantidad: 1 } })

  // Stock actual antes: harina 5, masa 97, coca 8.
  const vCombo = await req('POST', '/api/ventas', {
    productos: [{ comboId: combo.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vCombo.status === 201 && vCombo.data.venta.total === 30, 'venta combo total 30 (precio especial)')
  ok(vCombo.data.venta.productos.length === 2, 'combo genera 1 fila por producto incluido')
  ok(vCombo.data.venta.productos.every((vp) => vp.combo?.id === combo.id), 'filas del combo con comboId')
  const stockCocaCombo = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: coca.id } })
  ok(stockCocaCombo._sum.cantidad === 7, 'combo descuenta el producto reventa (coca 8->7)')
  const stockHarinaCombo = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: harina.id } })
  ok(stockHarinaCombo._sum.cantidad === 3, 'combo descuenta la receta del producto con receta (harina 5->3)')

  // Combo con stock insuficiente -> 409 con opciones de precio.
  const comboMixto = await prisma.combo.create({ data: { nombre: 'Combo Mixto', precioEspecial: 100 } })
  await prisma.combo_Producto.create({ data: { comboId: comboMixto.id, productoId: torta.id, cantidad: 1 } })
  await prisma.combo_Producto.create({ data: { comboId: comboMixto.id, productoId: coca.id, cantidad: 10 } })
  const vComboMix = await req('POST', '/api/ventas', {
    productos: [{ comboId: comboMixto.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vComboMix.status === 409, 'combo con stock insuficiente bloquea la venta -> 409')
  ok(
    vComboMix.data.opcionesPrecio && vComboMix.data.opcionesPrecio[0].precioReal === 25 &&
      vComboMix.data.opcionesPrecio[0].precioEspecial === 100,
    'opcionesPrecio: precio real (productos disponibles) y precio especial'
  )

  // Seguridad: un `precioCongelado` enviado por el cliente SIEMPRE se ignora
  // (el precio se calcula solo desde la BD). Antes existía el "otro precio"
  // manual; ya no: el combo se cobra a su precio especial (30).
  const vComboOtro = await req('POST', '/api/ventas', {
    productos: [{ comboId: combo.id, cantidad: 1, precioCongelado: 45 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vComboOtro.status === 201 && vComboOtro.data.venta.total === 30, 'combo: precioCongelado:45 del body IGNORADO -> se cobra precio especial 30')

  // Forzar venta de combo con usar_disponible (descuenta solo lo disponible).
  const comboBig = await prisma.combo.create({ data: { nombre: 'Combo Grande', precioEspecial: 100 } })
  await prisma.combo_Producto.create({ data: { comboId: comboBig.id, productoId: coca.id, cantidad: 10 } })
  const vComboForce = await req('POST', '/api/ventas', {
    productos: [{ comboId: comboBig.id, cantidad: 1 }],
    usarDisponible: [{ tipo: 'producto', id: coca.id }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vComboForce.status === 201 && vComboForce.data.venta.total === 100, 'combo forzado con usarDisponible -> 201')
  const stockCocaForce = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { productoId: coca.id } })
  ok(stockCocaForce._sum.cantidad === 0, 'coca queda en 0 tras forzar combo (no negativo)')

  console.log('== disponible_hoy bloqueado ==')
  const noDisp = await prisma.producto.create({
    data: { nombre: 'NoHoy', precio: 5, tipo: 'Reventa_directa', disponibleHoy: false },
  })
  const vNoDisp = await req('POST', '/api/ventas', {
    productos: [{ productoId: noDisp.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vNoDisp.status === 400, 'venta de producto no disponible hoy -> 400')
  const comboNoDisp = await prisma.combo.create({ data: { nombre: 'Combo NoHoy', precioEspecial: 3 } })
  await prisma.combo_Producto.create({ data: { comboId: comboNoDisp.id, productoId: noDisp.id, cantidad: 1 } })
  const vComboNoDisp = await req('POST', '/api/ventas', {
    productos: [{ comboId: comboNoDisp.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vComboNoDisp.status === 400, 'combo con producto no disponible hoy -> 400')

  console.log('== usar_disponible: devolución parcial revierte EXACTO el parcial ==')
  const capHarina = await prisma.ingrediente.create({ data: { nombre: 'CapHarina', unidadMedida: 'kg', stockActual: 7, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: capHarina.id, tipoMovimiento: 'Entrada', cantidad: 7 } })
  const capTorta = await prisma.producto.create({ data: { nombre: 'CapTorta', precio: 10, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: capTorta.id, ingredienteId: capHarina.id, cantidad: 2 } })

  // 3 unidades (requieren 6) + 2 unidades (requieren 4) = 10 requeridas; hay 7.
  // "usar disponible" descuenta solo 7, repartido entre las 2 filas (4 y 3).
  const vCap = await req('POST', '/api/ventas', {
    productos: [
      { productoId: capTorta.id, cantidad: 3 },
      { productoId: capTorta.id, cantidad: 2 },
    ],
    usarDisponible: [capHarina.id],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vCap.status === 201 && vCap.data.venta.total === 50, 'venta con usar_disponible -> 201 total 50')
  const stockCap0 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: capHarina.id } })
  ok(stockCap0._sum.cantidad === 0, 'capHarina queda en 0 tras el descuento parcial (10 requeridos, 7 disponibles)')
  const vpCap1 = vCap.data.venta.productos[0]
  const vpCap2 = vCap.data.venta.productos[1]
  const mvCap1 = await prisma.movimiento_Inventario.findFirst({ where: { ventaProductoId: vpCap1.id, tipoMovimiento: 'Salida_venta' } })
  const mvCap2 = await prisma.movimiento_Inventario.findFirst({ where: { ventaProductoId: vpCap2.id, tipoMovimiento: 'Salida_venta' } })
  ok(mvCap1 && mvCap1.cantidad === -4, 'fila de 3 unidades descuenta su fracción (4) vinculada a su ventaProductoId')
  ok(mvCap2 && mvCap2.cantidad === -3, 'fila de 2 unidades descuenta su fracción (3) vinculada a su ventaProductoId')

  // Devolución parcial de la fila de 2 unidades: regresa EXACTO su fracción
  // (3) — ni el consumo completo de la receta (4) ni cero.
  const devCap = await req('POST', '/api/devoluciones', {
    ventaId: vCap.data.venta.id,
    ventaProductoIds: [vpCap2.id],
    monto: 20,
    motivo: 'Otro',
    medioDevolucion: 'Efectivo',
    regresaAInventario: true,
  })
  ok(devCap.status === 201 && devCap.data.movimientosRegreso === 1, 'devolución parcial revierte 1 movimiento (el del parcial)')
  const stockCap1 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: capHarina.id } })
  ok(stockCap1._sum.cantidad === 3, 'revierte EXACTO el parcial (3, no 4 de la receta ni 0) -> capHarina 3')

  console.log('== e2e botón "Usar lo disponible" (409 -> reenvío con usarDisponible:true) ==')
  // Simula el flujo del botón del frontend: la primera petición (como
  // "Confirmar pedido") devuelve 409 con stockInsuficiente; el botón reenvía la
  // MISMA petición con usarDisponible:true y la venta debe completarse.
  const botHarina = await prisma.ingrediente.create({ data: { nombre: 'BotHarina', unidadMedida: 'kg', stockActual: 7, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: botHarina.id, tipoMovimiento: 'Entrada', cantidad: 7 } })
  const botTorta = await prisma.producto.create({ data: { nombre: 'BotTorta', precio: 10, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: botTorta.id, ingredienteId: botHarina.id, cantidad: 2 } })

  const payloadBot = {
    productos: [
      { productoId: botTorta.id, cantidad: 3 },
      { productoId: botTorta.id, cantidad: 2 },
    ],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  }
  const vBot409 = await req('POST', '/api/ventas', payloadBot)
  ok(vBot409.status === 409, '1ª petición (confirmar pedido) -> 409 con stock insuficiente')
  ok(
    vBot409.data.stockInsuficiente?.length === 1 &&
      vBot409.data.stockInsuficiente[0].tipo === 'ingrediente' &&
      vBot409.data.stockInsuficiente[0].requerido === 10 &&
      vBot409.data.stockInsuficiente[0].disponible === 7,
    '409 trae stockInsuficiente (requerido 10, disponible 7)'
  )

  const vBotOk = await req('POST', '/api/ventas', { ...payloadBot, usarDisponible: true })
  ok(vBotOk.status === 201 && vBotOk.data.venta.total === 50, '2ª petición con usarDisponible:true (botón) -> 201')
  const stockBot0 = await prisma.movimiento_Inventario.aggregate({ _sum: { cantidad: true }, where: { ingredienteId: botHarina.id } })
  ok(stockBot0._sum.cantidad === 0, 'stock queda en 0 (no negativo) tras "Usar lo disponible"')
  const vpBot1 = vBotOk.data.venta.productos[0]
  const vpBot2 = vBotOk.data.venta.productos[1]
  const mvBot1 = await prisma.movimiento_Inventario.findFirst({ where: { ventaProductoId: vpBot1.id, tipoMovimiento: 'Salida_venta' } })
  const mvBot2 = await prisma.movimiento_Inventario.findFirst({ where: { ventaProductoId: vpBot2.id, tipoMovimiento: 'Salida_venta' } })
  ok(mvBot1 && mvBot1.cantidad === -4, 'capShares: fila de 3 unidades descuenta su fracción (4)')
  ok(mvBot2 && mvBot2.cantidad === -3, 'capShares: fila de 2 unidades descuenta su fracción (3)')

  console.log('== es_venta_previa_apertura ignorada desde el body ==')
  const productoPrev = await prisma.producto.create({ data: { nombre: 'Prev', precio: 4, tipo: 'Reventa_directa' } })
  await prisma.movimiento_Inventario.create({ data: { productoId: productoPrev.id, tipoMovimiento: 'Entrada', cantidad: 5 } })
  const vPrev = await req('POST', '/api/ventas', {
    productos: [{ productoId: productoPrev.id, cantidad: 1 }],
    metodoPago: 'Efectivo',
    esVentaPreviaApertura: true,
    usuarioId: admin.id,
  })
  ok(vPrev.status === 201 && vPrev.data.venta.esVentaPreviaApertura === false, 'body esVentaPreviaApertura=true es ignorado (queda false)')

  console.log('== Reportes de ventas (GET /api/ventas) ==')
  const listVentas = await req('GET', '/api/ventas')
  ok(listVentas.status === 200 && Array.isArray(listVentas.data) && listVentas.data.length >= 4, 'listar ventas (admin)')
  ok(listVentas.data.every((v) => v.usuario && Array.isArray(v.productos) && v.diaOperativo), 'cada venta incluye usuario, productos y dia_operativo')

  const filtroMetodo = await req('GET', '/api/ventas?metodoPago=Tarjeta')
  ok(filtroMetodo.status === 200 && filtroMetodo.data.every((v) => v.metodoPago === 'Tarjeta') && filtroMetodo.data.some((v) => v.id === r2.data.venta.id), 'filtrar ventas por metodoPago')

  const filtroDia = await req('GET', `/api/ventas?diaOperativoId=${dia.id}`)
  ok(filtroDia.status === 200 && filtroDia.data.length === listVentas.data.length, 'filtrar ventas por diaOperativoId')

  const desdeTodo = await req('GET', `/api/ventas?fechaDesde=${encodeURIComponent('2000-01-01T00:00:00.000Z')}`)
  ok(desdeTodo.status === 200 && desdeTodo.data.length === listVentas.data.length, 'rango de fecha: desde 2000 incluye todas')
  const hastaNada = await req('GET', `/api/ventas?fechaHasta=${encodeURIComponent('2020-01-01T00:00:00.000Z')}`)
  ok(hastaNada.status === 200 && hastaNada.data.length === 0, 'rango de fecha: hasta 2020 no incluye ninguna')
  const filtroMal = await req('GET', '/api/ventas?metodoPago=Cripto')
  ok(filtroMal.status === 400, 'metodoPago inválido en filtro -> 400')

  console.log('== Reporte de auditoría "No cobrar" (GET /api/ventas/no-cobrar) ==')
  const vNoCobrar = await req('POST', '/api/ventas', {
    productos: [{ productoId: productoPrev.id, cantidad: 1 }],
    noCobrar: true,
    usuarioId: admin.id,
  })
  ok(vNoCobrar.status === 201 && vNoCobrar.data.venta.noCobrar === true, 'venta "No cobrar" registrada')
  const repNC = await req('GET', '/api/ventas/no-cobrar')
  ok(repNC.status === 200 && repNC.data.some((v) => v.id === vNoCobrar.data.venta.id), 'reporte no-cobrar incluye la venta marcada')
  const nc = repNC.data.find((v) => v.id === vNoCobrar.data.venta.id)
  ok(nc && Array.isArray(nc.productos) && nc.productos[0].producto && typeof nc.productos[0].costo === 'number' && nc.productos[0].cantidad === 1, 'reporte no-cobrar: producto, costo y cantidad')
  ok(nc && nc.usuario && nc.usuario.id === admin.id && nc.fechaHora, 'reporte no-cobrar: usuario que la marcó y hora')

  console.log('== Pedido con combo + modificador Agregar/Sustituir: reserva al CREAR ==')
  const ingAg4 = await prisma.ingrediente.create({ data: { nombre: 'IngAg4', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingAg4.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const extraAg4 = await prisma.ingrediente.create({ data: { nombre: 'ExtraAg4', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: extraAg4.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodAg4 = await prisma.producto.create({ data: { nombre: 'ProdAg4', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodAg4.id, ingredienteId: ingAg4.id, cantidad: 1 } })
  const modAg4 = await prisma.modificador.create({
    data: { nombre: 'ModAgregar4', tipo: 'Agregar', ingredienteAfectadoId: extraAg4.id, cantidadExtra: 2, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodAg4.id, modificadorId: modAg4.id } })
  const comboAg4 = await prisma.combo.create({ data: { nombre: 'ComboAg4', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboAg4.id, productoId: prodAg4.id, cantidad: 1 } })

  const stockIngAg4_0 = await stockIngrediente(ingAg4.id)
  const stockExtraAg4_0 = await stockIngrediente(extraAg4.id)
  const pComboAg4 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Agregar 4',
    productos: [{ comboId: comboAg4.id, cantidad: 2, productos: [{ productoId: prodAg4.id, modificadores: [{ modificadorId: modAg4.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pComboAg4.status === 201 && pComboAg4.data.estadoPago === 'Pendiente_pago', 'pedido combo+Agregar -> Pendiente_pago')
  ok((await stockIngrediente(ingAg4.id)) === stockIngAg4_0 - 2, 'reserva al CREAR descuenta la receta base del combo (1x2)')
  ok((await stockIngrediente(extraAg4.id)) === stockExtraAg4_0 - 4, 'reserva al CREAR descuenta el extra del modificador Agregar (2x2)')
  const pagarComboAg4 = await req('PATCH', `/api/pedidos/${pComboAg4.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarComboAg4.status === 200, 'pago del combo+Agregar')
  ok(pComboAg4.data.total === 66, 'pedido combo+Agregar -> total 66 ((30 base + 3 extra) x2)')
  ok(pagarComboAg4.data.venta.total === 66, 'pago del combo+Agregar -> venta 66 (el Agregar SÍ suma al precio)')
  ok(
    pComboAg4.data.productos.every((pp) => pp.comboPrecioCongelado === 33),
    'precio del combo congelado en 33 (base 30 + extra 3)',
  )
  ok((await stockIngrediente(ingAg4.id)) === stockIngAg4_0 - 2, 'pagar NO vuelve a descontar la receta (reserva ya hecha)')
  ok((await stockIngrediente(extraAg4.id)) === stockExtraAg4_0 - 4, 'pagar NO vuelve a descontar el extra (reserva ya hecha)')

  // Venta directa del mismo combo+Agregar: el precio final también sube.
  const vComboAg4 = await req('POST', '/api/ventas', {
    productos: [{ comboId: comboAg4.id, cantidad: 1, productos: [{ productoId: prodAg4.id, modificadores: [{ modificadorId: modAg4.id }] }] }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vComboAg4.status === 201 && vComboAg4.data.venta.total === 33, 'venta directa del combo+Agregar -> 33 (30 base + 3 extra)')

  const ingA4 = await prisma.ingrediente.create({ data: { nombre: 'IngA4', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingA4.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const ingB4 = await prisma.ingrediente.create({ data: { nombre: 'IngB4', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingB4.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const prodS4 = await prisma.producto.create({ data: { nombre: 'ProdS4', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodS4.id, ingredienteId: ingA4.id, cantidad: 1 } })
  const modS4 = await prisma.modificador.create({
    data: { nombre: 'ModSustituir4', tipo: 'Sustituir', ingredienteAfectadoId: ingA4.id, ingredienteSustitutoId: ingB4.id, cantidadSustituto: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: prodS4.id, modificadorId: modS4.id } })
  const comboS4 = await prisma.combo.create({ data: { nombre: 'ComboS4', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: comboS4.id, productoId: prodS4.id, cantidad: 1 } })

  const stockIngA4_0 = await stockIngrediente(ingA4.id)
  const stockIngB4_0 = await stockIngrediente(ingB4.id)
  const pComboS4 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Combo Sustituir 4',
    productos: [{ comboId: comboS4.id, cantidad: 1, productos: [{ productoId: prodS4.id, modificadores: [{ modificadorId: modS4.id }] }] }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pComboS4.status === 201 && pComboS4.data.estadoPago === 'Pendiente_pago', 'pedido combo+Sustituir -> Pendiente_pago')
  ok((await stockIngrediente(ingA4.id)) === stockIngA4_0, 'reserva al CREAR NO descuenta el ingrediente afectado A (se elimina de la receta)')
  ok((await stockIngrediente(ingB4.id)) === stockIngB4_0 - 3, 'reserva al CREAR descuenta el sustituto B (cantidadSustituto 3)')
  const pagarComboS4 = await req('PATCH', `/api/pedidos/${pComboS4.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagarComboS4.status === 200, 'pago del combo+Sustituir')
  ok((await stockIngrediente(ingB4.id)) === stockIngB4_0 - 3, 'pagar NO vuelve a descontar el sustituto (reserva ya hecha)')

  console.log('== Pedido viejo sin reserva: al pagarse valida stock (no descuenta a ciegas) ==')
  // Simula un pedido creado ANTES del rediseño de reserva (commit 2f87347):
  // se borran sus movimientos de reserva y el stock del ingrediente ya se
  // consumió en otra venta. Al pagarse se valida el stock como una venta
  // normal: 409 con faltantes y, con usarDisponible, descuento topeado (nunca
  // negativo).
  const ingR4 = await prisma.ingrediente.create({ data: { nombre: 'IngR4', unidadMedida: 'kg', stockActual: 1, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR4.id, tipoMovimiento: 'Entrada', cantidad: 1 } })
  const prodR4 = await prisma.producto.create({ data: { nombre: 'ProdR4', precio: 20, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: prodR4.id, ingredienteId: ingR4.id, cantidad: 1 } })
  const pR4 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'Viejo sin reserva 4',
    productos: [{ productoId: prodR4.id, cantidad: 1 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100,
    usuarioId: admin.id,
  })
  ok(pR4.status === 201 && pR4.data.estadoPago === 'Pendiente_pago', 'pedido creado Pendiente_pago (con reserva)')
  ok((await stockIngrediente(ingR4.id)) === 0, 'reserva al crear: stock 1 - 1 = 0')
  const borradosR4 = await prisma.movimiento_Inventario.deleteMany({
    where: { pedidoProductoId: { in: pR4.data.productos.map((x) => x.id) }, ventaProductoId: null },
  })
  ok(borradosR4.count > 0, 'reserva eliminada -> el pedido simula ser pre-rediseño (sin movimientos)')
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: ingR4.id, tipoMovimiento: 'Salida_venta', cantidad: -1 } })
  ok((await stockIngrediente(ingR4.id)) === 0, 'el ingrediente ya se consumió en otra venta (disponible 0)')
  const pagoViejoR4 = await req('PATCH', `/api/pedidos/${pR4.data.id}/estado-pago`, { estadoPago: 'Pagado', usuarioId: admin.id })
  ok(pagoViejoR4.status === 409, 'pagar pedido viejo sin stock -> 409 (NO descuenta a ciegas)')
  ok(
    Array.isArray(pagoViejoR4.data?.stockInsuficiente) &&
      pagoViejoR4.data.stockInsuficiente.some((f) => f.id === ingR4.id && f.requerido === 1 && f.disponible === 0),
    '409 reporta el faltante (requerido 1, disponible 0)'
  )
  ok((await stockIngrediente(ingR4.id)) === 0, 'sin usarDisponible el stock sigue 0 (nada descontado)')
  const pagoViejoR4Usar = await req('PATCH', `/api/pedidos/${pR4.data.id}/estado-pago`, { estadoPago: 'Pagado', usarDisponible: true, usuarioId: admin.id })
  ok(pagoViejoR4Usar.status === 200 && pagoViejoR4Usar.data.pedido?.estadoPago === 'Pagado', 'con usarDisponible:true el pago procede ("Usar lo disponible")')
  ok((await stockIngrediente(ingR4.id)) === 0, 'descuento topeado a lo disponible: stock 0 (NUNCA negativo)')

  // J = sin caja abierta
  await prisma.dia_Operativo.update({ where: { id: dia.id }, data: { estado: 'Cerrado' } })
  const sinCaja = await req('POST', '/api/ventas', { productos: [{ productoId: coca.id, cantidad: 1 }], metodoPago: 'Efectivo', usuarioId: admin.id })
  ok(sinCaja.status === 409 && /caja/i.test(sinCaja.data.message), 'venta sin caja abierta -> 409')

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
  const estSec4 = await req('GET', '/api/caja/estado')
  if (estSec4.data?.abierta) {
    await req('POST', '/api/caja/cerrar', { efectivoContado: 0, usuarioId: admin.id })
  }
  const abrirSec4 = await req('POST', '/api/caja/abrir', { fondoInicial: 0, usuarioId: admin.id })
  ok(abrirSec4.status === 201, 'abrir caja fresca para las pruebas de precio manipulado')

  const secIng4 = await prisma.ingrediente.create({ data: { nombre: 'SecIng4', unidadMedida: 'kg', stockActual: 100, stockMinimoAlerta: 0 } })
  await prisma.movimiento_Inventario.create({ data: { ingredienteId: secIng4.id, tipoMovimiento: 'Entrada', cantidad: 100 } })
  const secProd4 = await prisma.producto.create({ data: { nombre: 'SecProd4', precio: 15, tipo: 'Con_receta' } })
  await prisma.producto_Ingrediente.create({ data: { productoId: secProd4.id, ingredienteId: secIng4.id, cantidad: 1 } })
  const secMod4 = await prisma.modificador.create({
    data: { nombre: 'SecMod4', tipo: 'Agregar', ingredienteAfectadoId: secIng4.id, cantidadExtra: 1, costoAdicional: 3 },
  })
  await prisma.producto_Modificador.create({ data: { productoId: secProd4.id, modificadorId: secMod4.id } })
  const secCombo4 = await prisma.combo.create({ data: { nombre: 'SecCombo4', precioEspecial: 30 } })
  await prisma.combo_Producto.create({ data: { comboId: secCombo4.id, productoId: secProd4.id, cantidad: 1 } })

  const vSec4 = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd4.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec4.status === 201 && vSec4.data.venta.total === 15 && vSec4.data.venta.productos[0].precioCongelado === 15,
    'venta directa IGNORA precioCongelado:0.01 -> cobra 15 (precio de la BD)')

  const vSec4Mod = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd4.id, cantidad: 1, modificadores: [{ modificadorId: secMod4.id, costoAplicado: 0.01 }] }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec4Mod.status === 201 && vSec4Mod.data.venta.total === 18, 'costoAplicado:0.01 IGNORADO -> costo real 3 (total 18)')

  const vSec4Combo = await req('POST', '/api/ventas', {
    productos: [{ comboId: secCombo4.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec4Combo.status === 201 && vSec4Combo.data.venta.total === 30, 'combo IGNORA precioCongelado:0.01 -> cobra precio especial 30')

  const pSec4 = await req('POST', '/api/pedidos', {
    tipo: 'Para_recoger', origen: 'Telefono', nombreClienteLibre: 'SecPedido4',
    productos: [{ productoId: secProd4.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', montoReferenciaPago: 100, usuarioId: admin.id,
  })
  ok(pSec4.status === 201 && pSec4.data.total === 15, 'pedido IGNORA precioCongelado:0.01 al crearse -> total real 15')

  await prisma.producto.update({ where: { id: secProd4.id }, data: { precio: 999 } })
  const pagoSec4 = await req('PATCH', `/api/pedidos/${pSec4.data.id}/estado-pago`, { estadoPago: 'Pagado', precioCongelado: 0.01, usuarioId: admin.id })
  ok(pagoSec4.status === 200 && pagoSec4.data.venta.total === 15,
    'pago de pedido IGNORA precioCongelado:0.01 -> venta respeta el precio CONGELADO en BD (15, no 999)')

  const vSec4Nuevo = await req('POST', '/api/ventas', {
    productos: [{ productoId: secProd4.id, cantidad: 1, precioCongelado: 0.01 }],
    metodoPago: 'Efectivo', usuarioId: admin.id,
  })
  ok(vSec4Nuevo.status === 201 && vSec4Nuevo.data.venta.total === 999, 'precio SIEMPRE desde BD: tras subirlo a 999, la nueva venta cobra 999 (no 0.01)')

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
    await tx.combo_Producto.deleteMany()
    await tx.combo.deleteMany()
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