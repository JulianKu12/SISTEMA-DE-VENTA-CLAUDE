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

  // "Otro precio" manual: precioCongelado en el ítem del combo.
  const vComboOtro = await req('POST', '/api/ventas', {
    productos: [{ comboId: combo.id, cantidad: 1, precioCongelado: 45 }],
    metodoPago: 'Efectivo',
    usuarioId: admin.id,
  })
  ok(vComboOtro.status === 201 && vComboOtro.data.venta.total === 45, 'combo con "otro precio" manual (45)')

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
    await tx.devolucion.deleteMany()
    await tx.venta_Producto_Modificador.deleteMany()
    await tx.venta_Producto_Mitad.deleteMany()
    await tx.venta_Producto.deleteMany()
    await tx.venta.deleteMany()
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