// Sembrador temporal de VOLUMEN (2 años, ~73,000 ventas) para prueba de
// crecimiento/rendimiento. NO toca dev.db: usa la BD apuntada por DATABASE_URL
// (sec_vol.db). Se elimina después de la medición.
import { createTestPrisma } from './prisma/require-test-db.js'
import bcrypt from 'bcrypt'
import fs from 'node:fs'

const prisma = createTestPrisma()
const rnd = () => Math.random()
const ri = (min, max) => Math.floor(rnd() * (max - min + 1)) + min
const pick = (arr, w = null) => {
  if (!w) return arr[Math.floor(rnd() * arr.length)]
  let total = w.reduce((a, b) => a + b, 0)
  let r = rnd() * total
  for (let i = 0; i < arr.length; i++) {
    r -= w[i]
    if (r <= 0) return arr[i]
  }
  return arr[arr.length - 1]
}

const t0 = Date.now()
const log = (m) => console.log(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s ${m}`)

// ---------------- Catálogo base ----------------
const CAT = {
  ingredientes: [
    { id: 1, nombre: 'Pollo', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 10, costoUltimaCompra: 18 },
    { id: 2, nombre: 'Verduras', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 8 },
    { id: 3, nombre: 'Mayonesa', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 15 },
    { id: 4, nombre: 'Pan', unidadMedida: 'pieza', stockActual: 100000, stockMinimoAlerta: 100, costoUltimaCompra: 0.8 },
    { id: 5, nombre: 'Jamón', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 22 },
    { id: 6, nombre: 'Queso', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 25 },
    { id: 7, nombre: 'Lechuga', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 6 },
    { id: 8, nombre: 'Tomate', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 7 },
    { id: 9, nombre: 'Salsa de la casa', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 10 },
    { id: 10, nombre: 'Tortilla', unidadMedida: 'pieza', stockActual: 100000, stockMinimoAlerta: 100, costoUltimaCompra: 1 },
    { id: 11, nombre: 'Papa', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 10, costoUltimaCompra: 5 },
    { id: 12, nombre: 'Café molido', unidadMedida: 'kg', stockActual: 50000, stockMinimoAlerta: 5, costoUltimaCompra: 30 },
    { id: 13, nombre: 'Gaseosa 1L', unidadMedida: 'pieza', stockActual: 100000, stockMinimoAlerta: 50, costoUltimaCompra: 4 },
    { id: 14, nombre: 'Agua 500ml', unidadMedida: 'pieza', stockActual: 100000, stockMinimoAlerta: 50, costoUltimaCompra: 1 },
    { id: 15, nombre: 'Gaseosa personal', unidadMedida: 'pieza', stockActual: 100000, stockMinimoAlerta: 50, costoUltimaCompra: 2.2 },
    { id: 16, nombre: 'Jugo envasado', unidadMedida: 'pieza', stockActual: 100000, stockMinimoAlerta: 50, costoUltimaCompra: 2.5 },
  ],
  productos: [
    { id: 1, nombre: 'Pollo a la plancha', precio: 12, tipo: 'Con_receta', permiteMitadYMitad: true, receta: [{ i: 1, c: 0.2 }, { i: 2, c: 0.15 }, { i: 3, c: 0.05 }] },
    { id: 2, nombre: 'Chicharrón de pollo', precio: 11, tipo: 'Con_receta', permiteMitadYMitad: false, receta: [{ i: 1, c: 0.2 }, { i: 3, c: 0.05 }] },
    { id: 3, nombre: 'Sándwich de jamón', precio: 9, tipo: 'Con_receta', permiteMitadYMitad: true, receta: [{ i: 4, c: 2 }, { i: 5, c: 0.08 }, { i: 6, c: 0.05 }, { i: 7, c: 0.05 }, { i: 8, c: 0.05 }, { i: 3, c: 0.05 }] },
    { id: 4, nombre: 'Papa rellena', precio: 8, tipo: 'Con_receta', permiteMitadYMitad: false, receta: [{ i: 11, c: 0.25 }, { i: 2, c: 0.1 }, { i: 3, c: 0.04 }] },
    { id: 5, nombre: 'Gaseosa 1L', precio: 6, tipo: 'Reventa_directa', permiteMitadYMitad: false, receta: [] },
    { id: 6, nombre: 'Agua 500ml', precio: 2, tipo: 'Reventa_directa', permiteMitadYMitad: false, receta: [] },
    { id: 7, nombre: 'Café', precio: 4, tipo: 'Con_receta', permiteMitadYMitad: false, receta: [{ i: 12, c: 0.02 }] },
    { id: 8, nombre: 'Gaseosa personal', precio: 3.5, tipo: 'Reventa_directa', permiteMitadYMitad: false, receta: [] },
    { id: 9, nombre: 'Jugo envasado', precio: 4, tipo: 'Reventa_directa', permiteMitadYMitad: false, receta: [] },
  ],
  modificadores: [
    { id: 1, nombre: 'Quitar lechuga', tipo: 'Quitar', ingredienteAfectadoId: 7, cantidadExtra: null, costoAdicional: 0 },
    { id: 2, nombre: 'Quitar tomate', tipo: 'Quitar', ingredienteAfectadoId: 8, cantidadExtra: null, costoAdicional: 0 },
    { id: 3, nombre: 'Agregar queso extra', tipo: 'Agregar', ingredienteAfectadoId: 6, cantidadExtra: 0.03, costoAdicional: 1 },
    { id: 4, nombre: 'Agregar jamón extra', tipo: 'Agregar', ingredienteAfectadoId: 5, cantidadExtra: 0.05, costoAdicional: 1.5 },
    { id: 5, nombre: 'Sustituir mayonesa por salsa de la casa', tipo: 'Sustituir', ingredienteAfectadoId: 3, ingredienteSustitutoId: 9, cantidadSustituto: 0.05, costoAdicional: 0.5 },
  ],
  combos: [
    { id: 1, nombre: 'Combo Pollo + Gaseosa', precioEspecial: 15, productos: [{ p: 1, c: 1 }, { p: 5, c: 1 }] },
    { id: 2, nombre: 'Combo Sándwich + Café', precioEspecial: 12.5, productos: [{ p: 3, c: 1 }, { p: 7, c: 1 }] },
    { id: 3, nombre: 'Combo Familiar', precioEspecial: 30, productos: [{ p: 1, c: 2 }, { p: 4, c: 1 }, { p: 5, c: 1 }] },
  ],
}

const PROD_PESOS = [22, 15, 26, 14, 8, 5, 5, 3, 2]
const MODS_CON_RECETA = [1, 2, 3, 4, 5]
const METODOS = ['Efectivo', 'Efectivo', 'Efectivo', 'Efectivo', 'Efectivo', 'Efectivo', 'Efectivo', 'Tarjeta', 'Tarjeta', 'Transferencia']

// ---------------- Acumuladores con createMany por lotes ----------------
// Orden de flush respeta FKs: pedido antes de venta (venta.pedidoId -> pedido).
// pedido.ventaId se deja null (relación inversa no se enlaza a propósito).
const TABLAS = ['usuario', 'empleado', 'cliente', 'cliente_Referencia', 'ingrediente', 'producto', 'producto_Ingrediente', 'modificador', 'producto_Modificador', 'combo', 'combo_Producto', 'dia_Operativo', 'pedido', 'pedido_Producto', 'pedido_Producto_Mitad', 'pedido_Producto_Modificador', 'venta', 'venta_Producto', 'venta_Producto_Mitad', 'venta_Producto_Modificador', 'movimiento_Inventario', 'devolucion', 'gasto']
const lotes = {}
const n = {}
for (const t of TABLAS) { lotes[t] = []; n[t] = 0 }

// Solo se vuelca en checkpoints (flushAll), en orden de FKs. Las filas solo se
// sacan de la cola DESPUÉS de insertarse con éxito, para no perder ids.
function push(t, row) {
  lotes[t].push(row)
}
async function flush(t) {
  if (lotes[t].length === 0) return
  const data = lotes[t]
  for (let i = 0; i < data.length; i += 1000) {
    await prisma[t].createMany({ data: data.slice(i, i + 1000) })
  }
  lotes[t] = []
  n[t] += data.length
}
async function flushAll() {
  for (const t of TABLAS) await flush(t)
}

// ---------------- Consumos de una línea ----------------
function consumosBase(productoId, cantidad) {
  const p = CAT.productos.find((x) => x.id === productoId)
  if (p.tipo === 'Reventa_directa') return [{ productoId, cantidad: -cantidad }]
  return p.receta.map((r) => ({ ingredienteId: r.i, cantidad: -r.c * cantidad }))
}

function aplicarModificadores(consumos, mods) {
  const out = consumos.map((c) => ({ ...c }))
  for (const m of mods) {
    const mod = CAT.modificadores.find((x) => x.id === m)
    if (mod.tipo === 'Quitar') {
      const idx = out.findIndex((c) => c.ingredienteId === mod.ingredienteAfectadoId)
      if (idx >= 0) out[idx].cantidad = 0
    } else if (mod.tipo === 'Agregar') {
      const idx = out.findIndex((c) => c.ingredienteId === mod.ingredienteAfectadoId)
      if (idx >= 0) out[idx].cantidad -= mod.cantidadExtra
      else out.push({ ingredienteId: mod.ingredienteAfectadoId, cantidad: -mod.cantidadExtra })
    } else if (mod.tipo === 'Sustituir') {
      const idx = out.findIndex((c) => c.ingredienteId === mod.ingredienteAfectadoId)
      if (idx >= 0) {
        out[idx].ingredienteId = mod.ingredienteSustitutoId
        out[idx].cantidad = -mod.cantidadSustituto
      }
    }
  }
  return out.filter((c) => c.cantidad !== 0)
}

function montoMods(mods) {
  return mods.reduce((a, m) => a + CAT.modificadores.find((x) => x.id === m).costoAdicional, 0)
}

// Devuelve { filas: [{vpRow, consumos, mods, mitad}], comboPrecio }
function generarItem(cantidad) {
  const r = rnd()
  if (r < 0.15) {
    const combo = pick(CAT.combos, [40, 35, 25])
    const filas = []
    for (const cp of combo.productos) {
      const filaCantidad = cantidad * cp.c
      filas.push({
        vpRow: { productoId: cp.p, cantidad: filaCantidad, precioCongelado: CAT.productos.find((x) => x.id === cp.p).precio, esMitadYMitad: false, comboId: combo.id, comboPrecioCongelado: combo.precioEspecial },
        consumos: consumosBase(cp.p, filaCantidad),
        mods: [],
        mitad: null,
      })
    }
    return { filas, comboPrecio: combo.precioEspecial }
  }
  if (r < 0.3) {
    const s1 = pick([1, 3])
    const s2 = pick([1, 3])
    const p1 = CAT.productos.find((x) => x.id === s1)
    const p2 = CAT.productos.find((x) => x.id === s2)
    const precioMedio = (p1.precio + p2.precio) / 2
    return {
      filas: [{
        vpRow: { productoId: s1, cantidad, precioCongelado: precioMedio, esMitadYMitad: true, comboId: null, comboPrecioCongelado: null },
        consumos: [...consumosBase(s1, cantidad / 2), ...consumosBase(s2, cantidad / 2)],
        mods: [],
        mitad: { sabor1ProductoId: s1, sabor2ProductoId: s2 },
      }],
      comboPrecio: null,
    }
  }
  const pId = pick(CAT.productos, PROD_PESOS).id
  const p = CAT.productos.find((x) => x.id === pId)
  let mods = []
  if (p.tipo === 'Con_receta' && rnd() < 0.25) {
    const cuantos = ri(1, 2)
    const pool = [...MODS_CON_RECETA]
    for (let k = 0; k < cuantos; k++) mods.push(pool.splice(ri(0, pool.length - 1), 1)[0])
  }
  return {
    filas: [{
      vpRow: { productoId: pId, cantidad, precioCongelado: p.precio, esMitadYMitad: false, comboId: null, comboPrecioCongelado: null },
      consumos: aplicarModificadores(consumosBase(pId, cantidad), mods),
      mods,
      mitad: null,
    }],
    comboPrecio: null,
  }
}

function calcularTotal(items) {
  let total = 0
  for (const it of items) {
    if (it.comboPrecio != null) total += it.comboPrecio
    else for (const f of it.filas) total += f.vpRow.precioCongelado * f.vpRow.cantidad + montoMods(f.mods)
  }
  return total
}

// ---------------- Base ----------------
async function sembrarBase() {
  const pass = bcrypt.hashSync('admin123', 10)
  push('usuario', { id: 1, tipo: 'Administrador', nombre: 'Administrador', usuario: 'admin', contraseña: pass })
  push('usuario', { id: 2, tipo: 'Repartidor', nombre: 'Repartidor', usuario: 'repartidor', contraseña: pass })
  push('empleado', { id: 1, nombre: 'Cajero', estadoDisponibilidad: 'Disponible', usuarioId: null })
  push('empleado', { id: 2, nombre: 'Repartidor', estadoDisponibilidad: 'Disponible', usuarioId: 2 })
  await prisma.configuracion.create({ data: { id: 1, costoEnvio: 10, repartidorUnico: false } })

  for (let i = 1; i <= 20; i++) push('cliente', { id: i, nombre: `Cliente ${i}`, telefono: `9${String(900000000 + i)}`, estado: 'Activo' })
  for (let i = 1; i <= 15; i++) push('cliente_Referencia', { id: i, clienteId: ((i - 1) % 20) + 1, descripcion: `Referencia ${i}`, estado: 'Activo' })

  for (const ing of CAT.ingredientes) push('ingrediente', { ...ing, estado: 'Activo' })
  let pid = 0
  for (const p of CAT.productos) {
    push('producto', { id: p.id, nombre: p.nombre, precio: p.precio, tipo: p.tipo, permiteMitadYMitad: p.permiteMitadYMitad, disponibleHoy: true, estado: 'Activo' })
    for (const r of p.receta) {
      pid++
      push('producto_Ingrediente', { id: pid, productoId: p.id, ingredienteId: r.i, cantidad: r.c })
    }
  }
  for (const m of CAT.modificadores) push('modificador', { ...m, estado: 'Activo' })
  let pmid = 0
  for (const p of [1, 2, 3, 4]) for (const m of MODS_CON_RECETA) {
    pmid++
    push('producto_Modificador', { id: pmid, productoId: p, modificadorId: m })
  }
  let cbid = 0
  for (const combo of CAT.combos) {
    push('combo', { id: combo.id, nombre: combo.nombre, precioEspecial: combo.precioEspecial, estado: 'Activo' })
    for (const cp of combo.productos) {
      cbid++
      push('combo_Producto', { id: cbid, comboId: combo.id, productoId: cp.p, cantidad: cp.c })
    }
  }
  await flushAll()
}

// ---------------- Días ----------------
const DIAS = 730
const VENTAS_DIA = 100
const LAST_DAY = new Date(2026, 7, 18)

async function sembrarDias() {
  for (let d = 0; d < DIAS; d++) {
    const fecha = new Date(LAST_DAY.getFullYear(), LAST_DAY.getMonth(), LAST_DAY.getDate() - (DIAS - 1 - d))
    const abierto = d === DIAS - 1
    const apertura = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 8, 0, 0)
    const cierre = abierto ? null : new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 20, 0, 0)
    push('dia_Operativo', { id: d + 1, fechaApertura: apertura, fechaCierre: cierre, fondoInicial: 100, efectivoContado: abierto ? null : 1850, diferencia: abierto ? null : 0, estado: abierto ? 'Abierto' : 'Cerrado', usuarioId: 1 })

    for (let v = 0; v < VENTAS_DIA; v++) {
      const hora = 8 + Math.floor(rnd() * 12)
      const fechaHora = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hora, Math.floor(rnd() * 60), Math.floor(rnd() * 60))
      const esPedido = rnd() < 0.55
      const numItems = pick([1, 1, 1, 1, 1, 2, 2, 2, 3, 3])

      const items = []
      for (let k = 0; k < numItems; k++) items.push(generarItem(pick([1, 1, 1, 1, 2, 2, 3])))
      const total = calcularTotal(items)

      let pedidoId = null
      let metodo = pick(METODOS)
      if (esPedido) {
        pedidoId = n['pedido'] + lotes['pedido'].length + 1
        const tipo = rnd() < 0.7 ? 'Para_recoger' : 'A_domicilio'
        metodo = tipo === 'A_domicilio' ? pick(['Efectivo', 'Efectivo', 'Transferencia']) : metodo
        const costoEnvio = tipo === 'A_domicilio' ? 10 : 0
        const tieneCliente = rnd() < 0.7
        const clienteId = tieneCliente ? ri(1, 20) : null
        const refId = tieneCliente && rnd() < 0.4 ? (((clienteId - 1) % 15) + 1) : null
        push('pedido', {
          id: pedidoId, tipo, origen: pick(['Mostrador', 'Mostrador', 'Mostrador', 'Telefono']),
          estadoPreparacion: 'Entregado', estadoPago: 'Pagado',
          clienteId, nombreClienteLibre: tieneCliente ? null : `Cliente libre ${v}`,
          referenciaId: refId, referenciaLibre: null,
          costoEnvio, repartidorId: tipo === 'A_domicilio' ? 2 : null,
          metodoPago: metodo, noCobrar: false, total: total + costoEnvio,
          fechaHoraCreacion: fechaHora, ventaId: null,
        })
      }

      const ventaId = n['venta'] + lotes['venta'].length + 1
      push('venta', { id: ventaId, fechaHora, pedidoId, total, metodoPago: metodo, noCobrar: false, usuarioId: 1, diaOperativoId: d + 1, esVentaPreviaApertura: false })

      for (const it of items) {
        for (const f of it.filas) {
          const vpId = n['venta_Producto'] + lotes['venta_Producto'].length + 1
          const ppId = esPedido ? n['pedido_Producto'] + lotes['pedido_Producto'].length + 1 : null
          push('venta_Producto', { id: vpId, ventaId, ...f.vpRow })
          if (esPedido) {
            push('pedido_Producto', {
              id: ppId, pedidoId, productoId: f.vpRow.productoId, cantidad: f.vpRow.cantidad,
              precioCongelado: f.vpRow.precioCongelado, esMitadYMitad: f.vpRow.esMitadYMitad,
              comboId: f.vpRow.comboId, comboPrecioCongelado: f.vpRow.comboPrecioCongelado,
            })
          }
          if (f.mitad) {
            push('venta_Producto_Mitad', { id: n['venta_Producto_Mitad'] + lotes['venta_Producto_Mitad'].length + 1, ventaProductoId: vpId, ...f.mitad })
            if (esPedido) push('pedido_Producto_Mitad', { id: n['pedido_Producto_Mitad'] + lotes['pedido_Producto_Mitad'].length + 1, pedidoProductoId: ppId, ...f.mitad })
          }
          for (const m of f.mods) {
            const costo = CAT.modificadores.find((x) => x.id === m).costoAdicional
            push('venta_Producto_Modificador', { id: n['venta_Producto_Modificador'] + lotes['venta_Producto_Modificador'].length + 1, ventaProductoId: vpId, modificadorId: m, costoAplicado: costo })
            if (esPedido) push('pedido_Producto_Modificador', { id: n['pedido_Producto_Modificador'] + lotes['pedido_Producto_Modificador'].length + 1, pedidoProductoId: ppId, modificadorId: m, costoAplicado: costo })
          }
          for (const c of f.consumos) {
            push('movimiento_Inventario', {
              id: n['movimiento_Inventario'] + lotes['movimiento_Inventario'].length + 1,
              ...c, tipoMovimiento: 'Salida_venta', fechaHora,
              referenciaId: ventaId, referenciaTipo: 'Venta', ventaProductoId: vpId, pedidoProductoId: esPedido ? ppId : null,
            })
          }
        }
      }

      if (rnd() < 0.05) {
        const regresa = rnd() < 0.5
        const primera = items[0]?.filas[0]
        const montoDev = Math.round(total * 0.4 * 100) / 100
        const vpId = n['venta_Producto'] + lotes['venta_Producto'].length
        const fechDev = new Date(fechaHora.getTime() + ri(30, 120) * 60000)
        push('devolucion', {
          id: n['devolucion'] + lotes['devolucion'].length + 1, ventaId,
          monto: montoDev, motivo: pick(['Producto_mal_estado', 'Pedido_incorrecto', 'Cliente_insatisfecho', 'Otro']),
          medioPagoOriginal: metodo, medioDevolucion: rnd() < 0.6 ? 'Efectivo_de_caja' : 'Efectivo',
          regresaAInventario: regresa, ventaProductoIds: vpId > 0 ? JSON.stringify([vpId]) : null, cantidadesVentaProducto: null,
          fechaHora: fechDev, diaOperativoId: d + 1,
        })
        if (regresa && primera) {
          const c = primera.consumos[0]
          push('movimiento_Inventario', {
            id: n['movimiento_Inventario'] + lotes['movimiento_Inventario'].length + 1,
            ...(c.ingredienteId != null ? { ingredienteId: c.ingredienteId } : { productoId: c.productoId }),
            tipoMovimiento: 'Devolucion_regreso', cantidad: -c.cantidad, fechaHora: fechDev,
            referenciaId: ventaId, referenciaTipo: 'Devolucion', ventaProductoId: null, pedidoProductoId: null,
          })
        }
      }
    }

    push('gasto', {
      id: n['gasto'] + lotes['gasto'].length + 1,
      concepto: pick(['Insumos del día', 'Luz', 'Reparto gasolina', 'Limpieza']),
      monto: pick([40, 60, 120, 30, 80]), categoria: pick(['Insumos', 'Servicios', 'Sueldos', 'Otro']),
      metodoPago: 'Efectivo', fechaHora: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 19, 30, 0),
      diaOperativoId: d + 1, origen: 'Manual', usuarioId: 1,
    })

    if (d % 50 === 49 || d === DIAS - 1) {
      log(`día ${d + 1}/${DIAS} — ventas ${n['venta'] + lotes['venta'].length} movs ${n['movimiento_Inventario'] + lotes['movimiento_Inventario'].length}`)
      await flushAll()
    }
  }
  await flushAll()
}

// Pedidos pendientes de HOY (panel del día)
async function sembrarPendientesHoy() {
  const fecha = new Date(LAST_DAY.getFullYear(), LAST_DAY.getMonth(), LAST_DAY.getDate())
  const estados = ['Pendiente', 'Pendiente', 'En_preparacion', 'En_preparacion', 'Enviado', 'Pendiente']
  for (let i = 0; i < estados.length; i++) {
    const pedidoId = n['pedido'] + lotes['pedido'].length + 1
    const tipo = i % 2 === 0 ? 'A_domicilio' : 'Para_recoger'
    const items = [generarItem(1), generarItem(1)]
    const total = calcularTotal(items)
    const costoEnvio = tipo === 'A_domicilio' ? 10 : 0
    push('pedido', {
      id: pedidoId, tipo, origen: pick(['Mostrador', 'Telefono']),
      estadoPreparacion: estados[i], estadoPago: 'Pendiente_pago',
      clienteId: ri(1, 20), referenciaId: null, costoEnvio,
      repartidorId: tipo === 'A_domicilio' ? 2 : null, metodoPago: 'Efectivo',
      noCobrar: false, total: total + costoEnvio,
      fechaHoraCreacion: new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 11 + i, 20, 0),
      ventaId: null,
    })
    for (const it of items) {
      for (const f of it.filas) {
        const ppId = n['pedido_Producto'] + lotes['pedido_Producto'].length + 1
        push('pedido_Producto', {
          id: ppId, pedidoId, productoId: f.vpRow.productoId, cantidad: f.vpRow.cantidad,
          precioCongelado: f.vpRow.precioCongelado, esMitadYMitad: f.vpRow.esMitadYMitad,
          comboId: f.vpRow.comboId, comboPrecioCongelado: f.vpRow.comboPrecioCongelado,
        })
        if (f.mitad) push('pedido_Producto_Mitad', { id: n['pedido_Producto_Mitad'] + lotes['pedido_Producto_Mitad'].length + 1, pedidoProductoId: ppId, ...f.mitad })
        for (const m of f.mods) push('pedido_Producto_Modificador', { id: n['pedido_Producto_Modificador'] + lotes['pedido_Producto_Modificador'].length + 1, pedidoProductoId: ppId, modificadorId: m, costoAplicado: CAT.modificadores.find((x) => x.id === m).costoAdicional })
        for (const c of f.consumos) {
          push('movimiento_Inventario', {
            id: n['movimiento_Inventario'] + lotes['movimiento_Inventario'].length + 1,
            ...c, tipoMovimiento: 'Salida_venta',
            referenciaId: pedidoId, referenciaTipo: null, ventaProductoId: null, pedidoProductoId: ppId,
          })
        }
      }
    }
  }
  await flushAll()
}

async function main() {
  log('inicio')
  await sembrarBase()
  log(`base lista`)
  await sembrarDias()
  await sembrarPendientesHoy()
  for (const t of TABLAS) {
    const filas = await prisma[t].count()
    console.log(`COUNT_${t}: ${filas}`)
  }
  console.log('DB_BYTES:', fs.statSync(process.env.DATABASE_URL.replace('file:', '').split('?')[0]).size)
  console.log('SEED_OK')
}

main()
  .catch((e) => { console.error('SEED_ERROR', e); process.exit(1) })
  .finally(() => prisma.$disconnect())