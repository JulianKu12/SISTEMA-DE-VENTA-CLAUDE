import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { METODOS_PAGO, esEnumValido } from '../utils/enums.js'
import {
  stockDe,
  sincronizarStockIngrediente,
  normalizarUsarDisponible,
  resolverNombreCuenta,
} from '../utils/inventario.js'

const STOCK_INSUFICIENTE_STATUS = 409

function validarCantidad(cantidad) {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new HttpError(400, 'cantidad debe ser un entero mayor o igual a 1')
  }
}

// Agrega un requerimiento de stock (ingrediente o producto) al acumulador.
function acumular(requerimientos, tipo, id, cantidad) {
  const key = `${tipo}:${id}`
  requerimientos.set(key, (requerimientos.get(key) || 0) + cantidad)
}

// Suma los consumos de una lista de cuentas al acumulador global.
function agregarConsumos(requerimientos, consumos) {
  for (const c of consumos) {
    acumular(requerimientos, c.tipo, c.id, c.cantidad)
  }
}

// Une los consumos repetidos de la MISMA cuenta en una sola fila (p. ej. mitad y
// mitad con dos sabores del mismo ingrediente, o un modificador que repite un
// ingrediente). Así cada (fila, cuenta) aparece una sola vez y la distribución
// de "usar disponible" y los Movimiento_Inventario quedan 1:1 por cuenta.
function agruparConsumos(consumos) {
  const mapa = new Map()
  for (const c of consumos) {
    const clave = `${c.tipo}:${c.id}`
    const previo = mapa.get(clave)
    mapa.set(clave, { tipo: c.tipo, id: c.id, cantidad: (previo?.cantidad ?? 0) + c.cantidad })
  }
  return [...mapa.values()]
}

// Aplica los modificadores sobre la receta base por unidad.
//  - Agregar   : suma `cantidadExtra` al ingrediente afectado.
//  - Quitar    : elimina el ingrediente afectado.
//  - Sustituir : elimina el afectado y usa el sustituto.
// Devuelve la lista base ajustada y los registros de Venta_Producto_Modificador.
function aplicarModificadores(basePorUnidad, modificadoresDetallados) {
  const mapa = new Map(basePorUnidad.map((x) => [x.ingredienteId, x.cantidad]))
  const registros = []

  for (const m of modificadoresDetallados) {
    if (m.tipo === 'Agregar') {
      if (m.cantidadExtra == null) {
        throw new HttpError(400, `El modificador ${m.nombre} (Agregar) requiere cantidadExtra`)
      }
      mapa.set(m.ingredienteAfectadoId, (mapa.get(m.ingredienteAfectadoId) || 0) + m.cantidadExtra)
    } else if (m.tipo === 'Quitar') {
      mapa.delete(m.ingredienteAfectadoId)
    } else if (m.tipo === 'Sustituir') {
      if (m.ingredienteSustitutoId == null) {
        throw new HttpError(400, `El modificador ${m.nombre} (Sustituir) requiere ingredienteSustitutoId`)
      }
      if (m.cantidadSustituto == null || !(m.cantidadSustituto > 0)) {
        throw new HttpError(400, `El modificador ${m.nombre} (Sustituir) requiere cantidadSustituto mayor a 0`)
      }
      mapa.delete(m.ingredienteAfectadoId)
      mapa.set(m.ingredienteSustitutoId, (mapa.get(m.ingredienteSustitutoId) || 0) + m.cantidadSustituto)
    }
    registros.push({ modificadorId: m.id, costoAplicado: m.costoAplicado ?? m.costoAdicional })
  }

  return {
    base: [...mapa.entries()].map(([ingredienteId, cantidad]) => ({ ingredienteId, cantidad })),
    registros,
  }
}

// Expande un ítem de COMBO (docs/03): descuenta inventario según la receta de
// cada Producto incluido (Combo_Producto), cobra el precio del combo (precio
// especial o "otro precio" manual) y devuelve una fila por producto para
// Venta_Producto/Pedido_Producto con su comboId.
//
// El combo mantiene un "precio cerrado": los modificadores que se pidan por
// producto incluido ajustan el consumo de inventario (quitar/agregar/sustituir
// ingredientes) pero NUNCA cambian el precio cobrado del combo. Opcionalmente
// cada producto puede llevar su propia nota (`productos: [{ productoId, nota,
// modificadores }]`) y el combo una nota general (`item.nota`).
async function procesarCombo(tx, item, opciones = {}) {
  const combo = await tx.combo.findUnique({
    where: { id: Number(item.comboId) },
    include: {
      productos: {
        include: {
          producto: {
            include: {
              productoIngredientes: true,
              productoModificadores: { include: { modificador: true } },
            },
          },
        },
      },
    },
  })
  if (!combo) throw new HttpError(404, `El combo ${item.comboId} no existe`)
  if (combo.estado !== 'Activo') {
    throw new HttpError(400, `El combo "${combo.nombre}" está ${combo.estado}. No se puede vender.`)
  }
  if (!combo.productos.length) {
    throw new HttpError(400, `El combo "${combo.nombre}" no tiene productos asociados`)
  }

  const cantidad = Number(item.cantidad)
  validarCantidad(cantidad)

  // Precio por unidad del combo: "otro precio" manual (precioCongelado) o el
  // precio_especial del combo (docs/03).
  const comboPrecioCongelado = item.precioCongelado ?? combo.precioEspecial
  const notaCombo = typeof item.nota === 'string' ? item.nota.trim() : ''

  // Mapa para vincular los Pedido_Producto ya creados al generar la Venta
  // desde un Pedido (pedidoProductos: [{productoId, pedidoProductoId}]).
  const vinculos = new Map()
  if (Array.isArray(item.pedidoProductos)) {
    for (const v of item.pedidoProductos) vinculos.set(Number(v.productoId), v.pedidoProductoId)
  }

  // Configuraciones opcionales por producto incluido (productos: [{productoId,
  // nota, modificadores}]). Se ignoran productos que no pertenezcan al combo.
  const configPorProducto = new Map()
  if (Array.isArray(item.productos)) {
    for (const cfg of item.productos) {
      if (cfg?.productoId != null) configPorProducto.set(Number(cfg.productoId), cfg)
    }
  }

  const detalleProductos = []
  let precioReal = 0
  for (const cp of combo.productos) {
    const p = cp.producto
    if (!opciones.ignorarEstado && p.estado === 'Inactivo') {
      throw new HttpError(400, `El producto "${p.nombre}" del combo está inactivo`)
    }
    if (!opciones.ignorarEstado && !p.disponibleHoy) {
      throw new HttpError(400, `El producto "${p.nombre}" del combo no está disponible hoy`)
    }
    const filaCantidad = cantidad * cp.cantidad

    const cfg = configPorProducto.get(p.id) ?? {}
    const modificadoresDetallados = []
    if (Array.isArray(cfg.modificadores) && cfg.modificadores.length > 0) {
      if (p.tipo !== 'Con_receta') {
        throw new HttpError(
          400,
          `El producto "${p.nombre}" del combo es de reventa directa y no admite modificadores`
        )
      }
      const permitidos = new Set(p.productoModificadores.map((pm) => pm.modificadorId))
      for (const md of cfg.modificadores) {
        const id = Number(md.modificadorId)
        const mod = await tx.modificador.findUnique({ where: { id } })
        if (!mod) throw new HttpError(404, `El modificador ${id} no existe`)
        if (mod.estado === 'Inactivo') {
          throw new HttpError(400, `El modificador "${mod.nombre}" está inactivo`)
        }
        if (!permitidos.has(mod.id)) {
          throw new HttpError(
            400,
            `El modificador "${mod.nombre}" no está asociado al producto "${p.nombre}"`
          )
        }
        if (md.costoAplicado !== undefined) mod.costoAplicado = md.costoAplicado
        modificadoresDetallados.push(mod)
      }
    }

    const consumos = []
    if (p.tipo === 'Reventa_directa') {
      if (modificadoresDetallados.length > 0) {
        throw new HttpError(
          400,
          `El producto "${p.nombre}" del combo es de reventa directa y no admite modificadores`
        )
      }
      consumos.push({ tipo: 'producto', id: p.id, cantidad: filaCantidad })
    } else {
      const basePorUnidad = p.productoIngredientes.map((pi) => ({
        ingredienteId: pi.ingredienteId,
        cantidad: pi.cantidad,
      }))
      const { base } = aplicarModificadores(basePorUnidad, modificadoresDetallados)
      for (const x of base) {
        consumos.push({ tipo: 'ingrediente', id: x.ingredienteId, cantidad: x.cantidad * filaCantidad })
      }
    }
    // "Precio real" = suma de precios normales de los productos del combo
    // (docs/03), usado para ofrecer vender por separado si falta stock.
    precioReal += p.precio * cp.cantidad
    detalleProductos.push({
      productoId: p.id,
      cantidad: filaCantidad,
      precioCongelado: p.precio,
      consumos,
      modificadores: modificadoresDetallados.map((m) => ({
        modificadorId: m.id,
        costoAplicado: m.costoAplicado ?? m.costoAdicional,
      })),
      nota: typeof cfg.nota === 'string' ? cfg.nota.trim() : '',
      pedidoProductoId: vinculos.get(p.id) ?? null,
    })
  }

  return {
    tipo: 'combo',
    comboId: combo.id,
    cantidad,
    comboPrecioCongelado,
    nota: notaCombo,
    precioReal,
    detalleProductos,
  }
}

// Procesa UN ítem de la venta/pedido (producto normal o combo) y devuelve su
// consumo de inventario por cuenta. `opciones.ignorarEstado` permite recalcular
// (p. ej. devoluciones) aunque hoy esté inactivo o no disponible.
// `item.precioCongelado` permite forzar el precio (p. ej. al generar la Venta
// desde un Pedido cuyos precios ya quedaron congelados al capturarse).
export async function procesarItem(tx, item, opciones = {}) {
  if (item.comboId != null) {
    return procesarCombo(tx, item, opciones)
  }

  const producto = await tx.producto.findUnique({
    where: { id: Number(item.productoId) },
    include: {
      productoIngredientes: true,
      productoModificadores: { include: { modificador: true } },
    },
  })
  if (!producto) throw new HttpError(404, `El producto ${item.productoId} no existe`)
  if (!opciones.ignorarEstado && producto.estado === 'Inactivo') {
    throw new HttpError(400, `El producto "${producto.nombre}" está inactivo`)
  }
  if (!opciones.ignorarEstado && !producto.disponibleHoy) {
    throw new HttpError(400, `El producto "${producto.nombre}" no está disponible hoy`)
  }

  const cantidad = Number(item.cantidad)
  validarCantidad(cantidad)

  const esMitad = item.esMitadYMitad === true
  const nota = typeof item.nota === 'string' ? item.nota.trim() : ''

  const precioCongelado = item.precioCongelado ?? producto.precio

  // Modificadores pedidos (solo aplican a productos con receta).
  const modificadoresDetallados = []
  if (Array.isArray(item.modificadores) && item.modificadores.length > 0) {
    if (producto.tipo !== 'Con_receta') {
      throw new HttpError(400, `El producto "${producto.nombre}" es de reventa directa y no admite modificadores`)
    }
    const permitidos = new Set(producto.productoModificadores.map((pm) => pm.modificadorId))
    for (const md of item.modificadores) {
      const id = Number(md.modificadorId)
      const mod = await tx.modificador.findUnique({ where: { id } })
      if (!mod) throw new HttpError(404, `El modificador ${id} no existe`)
      if (mod.estado === 'Inactivo') {
        throw new HttpError(400, `El modificador "${mod.nombre}" está inactivo`)
      }
      if (!permitidos.has(mod.id)) {
        throw new HttpError(400, `El modificador "${mod.nombre}" no está asociado al producto "${producto.nombre}"`)
      }
      // Permite congelar el costo del modificador (p. ej. generando la Venta
      // desde un Pedido cuyos costos quedaron fijos al capturarse).
      if (md.costoAplicado !== undefined) mod.costoAplicado = md.costoAplicado
      modificadoresDetallados.push(mod)
    }
  }

  const consumos = []

  if (producto.tipo === 'Reventa_directa') {
    if (esMitad) {
      throw new HttpError(400, `El producto "${producto.nombre}" es de reventa directa y no admite mitad y mitad`)
    }
    consumos.push({ tipo: 'producto', id: producto.id, cantidad })
    return {
      tipo: 'producto',
      detalle: {
        productoId: producto.id,
        cantidad,
        precioCongelado,
        esMitadYMitad: false,
        modificadores: [],
        nota,
        pedidoProductoId: item.pedidoProductoId ?? null,
      },
      consumos,
    }
  }

  // ----- Con_receta -----
  let basePorUnidad = producto.productoIngredientes.map((pi) => ({
    ingredienteId: pi.ingredienteId,
    cantidad: pi.cantidad,
  }))

  const { base, registros } = aplicarModificadores(basePorUnidad, modificadoresDetallados)

  if (esMitad) {
    if (!producto.permiteMitadYMitad) {
      throw new HttpError(400, `El producto "${producto.nombre}" no permite mitad y mitad`)
    }
    const sabor1Id = Number(item.sabor1ProductoId)
    const sabor2Id = Number(item.sabor2ProductoId)
    if (!sabor1Id || !sabor2Id) {
      throw new HttpError(400, `El producto mitad y mitad "${producto.nombre}" requiere sabor1ProductoId y sabor2ProductoId`)
    }

    const sabor1 = await tx.producto.findUnique({ where: { id: sabor1Id }, include: { productoIngredientes: true } })
    const sabor2 = await tx.producto.findUnique({ where: { id: sabor2Id }, include: { productoIngredientes: true } })
    if (!sabor1) throw new HttpError(404, `El sabor 1 (producto ${sabor1Id}) no existe`)
    if (!sabor2) throw new HttpError(404, `El sabor 2 (producto ${sabor2Id}) no existe`)
    if (sabor1.tipo !== 'Con_receta' || sabor2.tipo !== 'Con_receta') {
      throw new HttpError(400, 'Los sabores de un producto mitad y mitad deben tener receta')
    }
    if (!opciones.ignorarEstado) {
      for (const s of [sabor1, sabor2]) {
        if (s.estado === 'Inactivo') {
          throw new HttpError(400, `El sabor "${s.nombre}" está inactivo`)
        }
        if (!s.disponibleHoy) {
          throw new HttpError(400, `El sabor "${s.nombre}" no está disponible hoy`)
        }
      }
    }

    // La receta se divide al 50% con REDONDEO HACIA ARRIBA (docs/03 y docs/04).
    const dividirMitad = (ingredientes) =>
      ingredientes.map((x) => ({ ingredienteId: x.ingredienteId, cantidad: Math.ceil(x.cantidad / 2) }))

    // El producto base NO consume inventario propio en mitad y mitad: su rol es
    // solo representar precio/tamaño vendido. Solo se descuenta la mitad de la
    // receta de cada sabor (sabor1/2 + sabor2/2), redondeando hacia arriba.
    const porUnidad = [
      ...dividirMitad(sabor1.productoIngredientes),
      ...dividirMitad(sabor2.productoIngredientes),
    ]

    for (const x of porUnidad) {
      consumos.push({ tipo: 'ingrediente', id: x.ingredienteId, cantidad: x.cantidad * cantidad })
    }

    return {
      tipo: 'producto',
      detalle: {
        productoId: producto.id,
        cantidad,
        precioCongelado,
        esMitadYMitad: true,
        sabor1ProductoId: sabor1.id,
        sabor2ProductoId: sabor2.id,
        modificadores: registros,
        nota,
        pedidoProductoId: item.pedidoProductoId ?? null,
      },
      consumos,
    }
  }

  for (const x of base) {
    consumos.push({ tipo: 'ingrediente', id: x.ingredienteId, cantidad: x.cantidad * cantidad })
  }

  return {
    tipo: 'producto',
    detalle: {
      productoId: producto.id,
      cantidad,
      precioCongelado,
      esMitadYMitad: false,
      modificadores: registros,
      nota,
      pedidoProductoId: item.pedidoProductoId ?? null,
    },
    consumos,
  }
}

// Calcula el subtotal de una lista de ítems ya procesados (misma fórmula que
// `ejecutarVenta`). Se usa para calcular el total de un Pedido al crearse.
export function calcularTotalItems(itemsProcesados) {
  let total = 0
  for (const it of itemsProcesados) {
    if (it.tipo === 'combo') {
      total += it.comboPrecioCongelado * it.cantidad
    } else {
      const subtotalModificadores = it.detalle.modificadores.reduce((acc, m) => acc + m.costoAplicado, 0)
      total += (it.detalle.precioCongelado + subtotalModificadores) * it.detalle.cantidad
    }
  }
  return total
}

// Crea una Venta reutilizando la lógica del Módulo 04. Se ejecuta dentro de la
// transacción del llamador (`tx`), de modo que puede componerse con otras
// operaciones (p. ej. ventas previas a apertura dentro de abrir caja — Módulo 05).
// Acepta ítems "crudos" (productoId/comboId) o ya procesados por `procesarItem`
// (p. ej. al cobrar un Pedido cuyos precios ya quedaron congelados).
// Devuelve { conflicto, faltantes, mensaje, opcionesPrecio } si falta stock sin
// confirmar, o { venta, usos } si se registró correctamente.
export async function ejecutarVenta(tx, {
  productos,
  metodoPago,
  noCobrar = false,
  esVentaPreviaApertura = false,
  pedidoId = null,
  costoEnvio = 0,
  usarDisponible,
  usuarioId,
  diaOperativoId,
}) {
  if (!Array.isArray(productos) || productos.length === 0) {
    throw new HttpError(400, 'Una venta requiere al menos un producto')
  }

  if (!noCobrar && metodoPago !== undefined && !esEnumValido(metodoPago, METODOS_PAGO)) {
    throw new HttpError(400, 'metodoPago inválido')
  }

  let pedidoIdResuelto = null
  if (pedidoId != null) {
    const pedido = await tx.pedido.findUnique({ where: { id: Number(pedidoId) } })
    if (!pedido) throw new HttpError(404, 'El pedido indicado no existe')
    pedidoIdResuelto = pedido.id
  }

  const prep = await prepararVenta(tx, { productos, usarDisponible })
  if (prep.conflicto) return prep

  const { ventaRows, total, usos, capShares } = prep
  const venta = await tx.venta.create({
    data: {
      pedidoId: pedidoIdResuelto,
      total: total + costoEnvio,
      metodoPago: noCobrar ? 'Efectivo' : (metodoPago ?? 'Efectivo'),
      noCobrar,
      esVentaPreviaApertura,
      usuarioId,
      diaOperativoId,
    },
  })

  for (const row of ventaRows) {
    const ventaProducto = await tx.venta_Producto.create({
      data: {
        ventaId: venta.id,
        productoId: row.data.productoId,
        cantidad: row.data.cantidad,
        precioCongelado: row.data.precioCongelado,
        esMitadYMitad: row.data.esMitadYMitad,
        comboId: row.comboId,
        comboPrecioCongelado: row.comboPrecioCongelado,
        nota: row.data.nota ?? null,
      },
    })

    if (row.data.esMitadYMitad) {
      await tx.venta_Producto_Mitad.create({
        data: {
          ventaProductoId: ventaProducto.id,
          sabor1ProductoId: row.data.sabor1ProductoId,
          sabor2ProductoId: row.data.sabor2ProductoId,
        },
      })
    }

    for (const m of row.modificadores) {
      await tx.venta_Producto_Modificador.create({
        data: {
          ventaProductoId: ventaProducto.id,
          modificadorId: m.modificadorId,
          costoAplicado: m.costoAplicado,
        },
      })
    }
    row.ventaProductoId = ventaProducto.id
  }

  // Movimiento_Inventario tipo Salida_venta, uno por cuenta de CADA fila
  // vendida (con su ventaProductoId/pedidoProductoId para revertir EXACTO
  // en devoluciones, cancelaciones y ediciones — sin recalcular con la
  // receta actual). Las cuentas con stock insuficiente confirmado usan la
  // fracción realmente descontada (capShares), no el consumo completo.
  for (let i = 0; i < ventaRows.length; i++) {
    const row = ventaRows[i]
    for (const c of row.consumos) {
      const cantidad = capShares.get(`${c.tipo}:${c.id}`)?.get(i) ?? c.cantidad
      if (!cantidad) continue
      await tx.movimiento_Inventario.create({
        data: {
          ...(c.tipo === 'ingrediente'
            ? { ingredienteId: c.id }
            : { productoId: c.id }),
          tipoMovimiento: 'Salida_venta',
          cantidad: -cantidad,
          referenciaId: venta.id,
          referenciaTipo: 'Venta',
          ventaProductoId: row.ventaProductoId,
          pedidoProductoId: row.pedidoProductoId,
        },
      })
      if (c.tipo === 'ingrediente') {
        await sincronizarStockIngrediente(tx, c.id)
      }
    }
  }

  // Si el pedido existe, dejar también la referencia de solo lectura
  // Pedido.venta_id apuntando a esta venta.
  if (pedidoIdResuelto) {
    await tx.pedido.update({ where: { id: pedidoIdResuelto }, data: { ventaId: venta.id } })
  }

  const creada = await tx.venta.findUnique({
    where: { id: venta.id },
    include: {
      productos: {
        include: {
          producto: { select: { id: true, nombre: true } },
          combo: { select: { id: true, nombre: true } },
          mitadYMitad: true,
          modificadores: { include: { modificador: { select: { id: true, nombre: true } } } },
        },
      },
      diaOperativo: { select: { id: true, estado: true } },
    },
  })
  return { venta: creada, usos }
}

// Prepara los ítems de una venta/pedido SIN efectos de escritura: normaliza,
// acumula requerimientos, valida stock (si validarStock) y calcula el "real a
// descontar" por fila/cuenta (usos, cuentasTope, capShares). Devuelve
// { conflicto, faltantes, mensaje, opcionesPrecio } si falta stock sin
// confirmar, o { itemsProcesados, ventaRows, total, usos, capShares }.
async function prepararVenta(tx, { productos, usarDisponible, validarStock = true }) {
  const confirmados = normalizarUsarDisponible(usarDisponible)
  const confirmarTodo = usarDisponible === true

  // 1) Calcular cuánto consume cada ítem y acumular requerimientos.
  const requerimientos = new Map()
  const itemsProcesados = []
  for (const item of productos) {
    const procesado = item?.tipo ? item : await procesarItem(tx, item)
    itemsProcesados.push(procesado)
    if (procesado.tipo === 'combo') {
      for (const dp of procesado.detalleProductos) agregarConsumos(requerimientos, dp.consumos)
    } else {
      agregarConsumos(requerimientos, procesado.consumos)
    }
  }

  // 2) Construir las filas (Venta_Producto o reserva de pedido) y el total.
  let total = 0
  const ventaRows = []
  for (const it of itemsProcesados) {
    if (it.tipo === 'combo') {
      total += it.comboPrecioCongelado * it.cantidad
      for (const dp of it.detalleProductos) {
        ventaRows.push({
          data: {
            productoId: dp.productoId,
            cantidad: dp.cantidad,
            precioCongelado: dp.precioCongelado,
            esMitadYMitad: false,
            nota: dp.nota || null,
          },
          comboId: it.comboId,
          comboPrecioCongelado: it.comboPrecioCongelado,
          modificadores: dp.modificadores || [],
          consumos: agruparConsumos(dp.consumos),
          pedidoProductoId: dp.pedidoProductoId ?? null,
        })
      }
    } else {
      const subtotalModificadores = it.detalle.modificadores.reduce((acc, m) => acc + m.costoAplicado, 0)
      total += (it.detalle.precioCongelado + subtotalModificadores) * it.detalle.cantidad
      ventaRows.push({
        data: {
          productoId: it.detalle.productoId,
          cantidad: it.detalle.cantidad,
          precioCongelado: it.detalle.precioCongelado,
          esMitadYMitad: it.detalle.esMitadYMitad,
          nota: it.detalle.nota || null,
          ...(it.detalle.esMitadYMitad
            ? {
                sabor1ProductoId: it.detalle.sabor1ProductoId,
                sabor2ProductoId: it.detalle.sabor2ProductoId,
              }
            : {}),
        },
        comboId: null,
        comboPrecioCongelado: null,
        modificadores: it.detalle.modificadores,
        consumos: agruparConsumos(it.consumos),
        pedidoProductoId: it.detalle.pedidoProductoId ?? null,
      })
    }
  }

  if (!validarStock) {
    return { itemsProcesados, ventaRows, total, usos: [], capShares: new Map() }
  }

  // 3) Validar stock contra la suma de movimientos de cada cuenta.
  const stocks = new Map()
  const faltantes = []
  for (const [key, requerido] of requerimientos) {
    const [tipo, id] = key.split(':')
    const disponible = await stockDe(tx, tipo, Number(id))
    stocks.set(key, disponible)
    if (disponible < requerido) {
      faltantes.push({
        tipo,
        id: Number(id),
        nombre: await resolverNombreCuenta(tx, tipo, Number(id)),
        requerido,
        disponible,
      })
    }
  }

  // 4) Si falta stock y el usuario NO confirmó esos ingredientes: responder
  //    con la cantidad disponible, SIN completar la operación.
  const sinConfirmar = faltantes.filter(
    (f) => !confirmarTodo && !confirmados.has(`${f.tipo}:${f.id}`)
  )
  if (sinConfirmar.length > 0) {
    const respuesta = {
      conflicto: true,
      faltantes,
      mensaje:
        'Stock insuficiente. Confirma qué ingredientes se usarán con la cantidad disponible para continuar (usarDisponible).',
    }

    // Para combos se ofrece además el "precio real" (suma de precios normales
    // de los productos del combo) y el precio especial, para vender por
    // separado lo disponible (docs/03).
    const combos = itemsProcesados.filter((it) => it.tipo === 'combo')
    if (combos.length > 0) {
      const cuentasOk = new Set()
      for (const [key, requerido] of requerimientos) {
        if ((stocks.get(key) ?? 0) >= requerido) cuentasOk.add(key)
      }
      respuesta.opcionesPrecio = combos.map((c) => {
        const disponibles = c.detalleProductos.filter((dp) =>
          dp.consumos.every((cc) => cuentasOk.has(`${cc.tipo}:${cc.id}`))
        )
        return {
          comboId: c.comboId,
          cantidad: c.cantidad,
          precioReal: disponibles.reduce((a, dp) => a + dp.precioCongelado, 0),
          precioEspecial: c.comboPrecioCongelado,
        }
      })
    }
    return respuesta
  }

  // 5) Calcular la cantidad REAL a descontar: para los confirmados con stock
  //    insuficiente se descuenta solo lo disponible (queda en 0, no negativo).
  const usos = []
  const cuentasTope = new Map()
  for (const [key, requerido] of requerimientos) {
    const [tipo, id] = key.split(':')
    const disponible = stocks.get(key)
    if (disponible >= requerido) {
      usos.push({ tipo, id: Number(id), cantidad: requerido })
    } else if (confirmarTodo || confirmados.has(key)) {
      usos.push({ tipo, id: Number(id), cantidad: disponible })
      cuentasTope.set(key, { tipo, id: Number(id), cantidad: disponible })
    } else {
      // No debería llegar: sinConfirmar habría frenado antes.
      usos.push({ tipo, id: Number(id), cantidad: requerido })
    }
  }

  // 6) Distribuir "usar disponible" (stock insuficiente confirmado) PROPORCIONAL-
  //    MENTE entre las filas que consumen cada cuenta topeada. Así cada
  //    Salida_venta queda vinculada a su ventaProductoId/pedidoProductoId y un
  //    regreso parcial (devolución por ventaProductoId o quitar un
  //    Pedido_Producto) revierte EXACTO el monto parcial realmente descontado.
  //    capShares: `tipo:id` -> Map(fila -> cantidad)
  const capShares = new Map()
  for (const [key, cuenta] of cuentasTope) {
    const filas = []
    for (let i = 0; i < ventaRows.length; i++) {
      for (const c of ventaRows[i].consumos) {
        if (`${c.tipo}:${c.id}` === key) filas.push({ row: i, cantidad: c.cantidad })
      }
    }
    const totalRequerido = filas.reduce((acc, f) => acc + f.cantidad, 0)
    if (totalRequerido <= 0) continue
    let restante = cuenta.cantidad
    const porFila = new Map()
    filas.forEach((f, idx) => {
      const esUltima = idx === filas.length - 1
      let share
      if (esUltima) {
        share = restante
      } else {
        share = Math.min(Math.round((f.cantidad * cuenta.cantidad) / totalRequerido), f.cantidad)
        share = Math.max(0, Math.min(share, restante))
      }
      restante -= share
      porFila.set(f.row, share)
    })
    capShares.set(key, porFila)
  }

  return { itemsProcesados, ventaRows, total, usos, capShares }
}

// Descuenta el inventario de un Pedido AL CREARSE (rediseño docs/04 + docs/06):
// genera los Movimiento_Inventario tipo Salida_venta EXACTOS (con modificadores,
// mitad y mitad y "usar disponible" ya aplicados), pero SIN venta de por medio:
// quedan "reservados" (referenciaId = pedido.id, ventaProductoId = null,
// pedidoProductoId por fila). Al pagarse, `crearVentaPedido` re-vincula esos
// movimientos a la Venta nueva sin duplicar el descuento.
// Devuelve { conflicto, faltantes, mensaje, opcionesPrecio } si falta stock sin
// confirmar, o { ok: true, movimientos } si se reservó correctamente.
export async function descontarInventarioPedido(tx, { productos, pedidoId, usarDisponible }) {
  const prep = await prepararVenta(tx, { productos, usarDisponible })
  if (prep.conflicto) return prep

  const { ventaRows, capShares } = prep
  let movimientos = 0
  for (let i = 0; i < ventaRows.length; i++) {
    const row = ventaRows[i]
    for (const c of row.consumos) {
      const cantidad = capShares.get(`${c.tipo}:${c.id}`)?.get(i) ?? c.cantidad
      if (!cantidad) continue
      await tx.movimiento_Inventario.create({
        data: {
          ...(c.tipo === 'ingrediente' ? { ingredienteId: c.id } : { productoId: c.id }),
          tipoMovimiento: 'Salida_venta',
          cantidad: -cantidad,
          referenciaId: pedidoId,
          pedidoProductoId: row.pedidoProductoId,
        },
      })
      movimientos++
      if (c.tipo === 'ingrediente') {
        await sincronizarStockIngrediente(tx, c.id)
      }
    }
  }
  return { ok: true, movimientos }
}

// Crea la Venta de un Pedido al pagarse (o marcarse "No cobrar" en la entrega)
// y RE-VINCULA los Movimiento_Inventario ya reservados al crear el pedido
// (referenciaId = pedido.id, ventaProductoId = null): los actualiza a
// referenciaId = venta.id, referenciaTipo = 'Venta' y ventaProductoId =
// ventaProducto.id. NUNCA duplica el descuento. Para pedidos creados antes del
// rediseño (sin movimientos reservados) se genera el descuento como respaldo.
export async function crearVentaPedido(tx, {
  productos,
  pedidoId,
  metodoPago = 'Efectivo',
  noCobrar = false,
  costoEnvio = 0,
  esVentaPreviaApertura = false,
  usuarioId,
  diaOperativoId,
}) {
  const prep = await prepararVenta(tx, { productos, validarStock: false })

  const venta = await tx.venta.create({
    data: {
      pedidoId,
      total: prep.total + costoEnvio,
      metodoPago,
      noCobrar,
      esVentaPreviaApertura,
      usuarioId,
      diaOperativoId,
    },
  })

  for (const row of prep.ventaRows) {
    const ventaProducto = await tx.venta_Producto.create({
      data: {
        ventaId: venta.id,
        productoId: row.data.productoId,
        cantidad: row.data.cantidad,
        precioCongelado: row.data.precioCongelado,
        esMitadYMitad: row.data.esMitadYMitad,
        comboId: row.comboId,
        comboPrecioCongelado: row.comboPrecioCongelado,
        nota: row.data.nota ?? null,
      },
    })

    if (row.data.esMitadYMitad) {
      await tx.venta_Producto_Mitad.create({
        data: {
          ventaProductoId: ventaProducto.id,
          sabor1ProductoId: row.data.sabor1ProductoId,
          sabor2ProductoId: row.data.sabor2ProductoId,
        },
      })
    }

    for (const m of row.modificadores) {
      await tx.venta_Producto_Modificador.create({
        data: {
          ventaProductoId: ventaProducto.id,
          modificadorId: m.modificadorId,
          costoAplicado: m.costoAplicado,
        },
      })
    }

    if (row.pedidoProductoId != null) {
      // Re-vincular la reserva hecha al crear el pedido (Salida_venta con
      // pedidoProductoId y SIN ventaProductoId todavía).
      const vinculados = await tx.movimiento_Inventario.updateMany({
        where: { pedidoProductoId: row.pedidoProductoId, ventaProductoId: null },
        data: { ventaProductoId: ventaProducto.id, referenciaId: venta.id, referenciaTipo: 'Venta' },
      })

      // Respaldo para pedidos creados ANTES del rediseño (sin reserva): se
      // genera el descuento como una venta normal para no perder trazabilidad.
      if (vinculados.count === 0) {
        for (const c of row.consumos) {
          await tx.movimiento_Inventario.create({
            data: {
              ...(c.tipo === 'ingrediente' ? { ingredienteId: c.id } : { productoId: c.id }),
              tipoMovimiento: 'Salida_venta',
              cantidad: -c.cantidad,
              referenciaId: venta.id,
              referenciaTipo: 'Venta',
              ventaProductoId: ventaProducto.id,
              pedidoProductoId: row.pedidoProductoId,
            },
          })
          if (c.tipo === 'ingrediente') {
            await sincronizarStockIngrediente(tx, c.id)
          }
        }
      }
    } else {
      // Fila sin pedidoProductoId (defensivo): descuento directo a la venta.
      for (const c of row.consumos) {
        await tx.movimiento_Inventario.create({
          data: {
            ...(c.tipo === 'ingrediente' ? { ingredienteId: c.id } : { productoId: c.id }),
            tipoMovimiento: 'Salida_venta',
            cantidad: -c.cantidad,
            referenciaId: venta.id,
            referenciaTipo: 'Venta',
            ventaProductoId: ventaProducto.id,
          },
        })
        if (c.tipo === 'ingrediente') {
          await sincronizarStockIngrediente(tx, c.id)
        }
      }
    }
  }

  await tx.pedido.update({ where: { id: pedidoId }, data: { ventaId: venta.id } })

  const creada = await tx.venta.findUnique({
    where: { id: venta.id },
    include: {
      productos: {
        include: {
          producto: { select: { id: true, nombre: true } },
          combo: { select: { id: true, nombre: true } },
          mitadYMitad: true,
          modificadores: { include: { modificador: { select: { id: true, nombre: true } } } },
        },
      },
      diaOperativo: { select: { id: true, estado: true } },
    },
  })
  return { venta: creada }
}

// GET /api/ventas — reporte completo de ventas (docs/07: solo Administrador).
// Filtros opcionales: rango de fecha (fechaDesde/fechaHasta), diaOperativoId y
// metodoPago. Cada venta incluye sus productos congelados, el usuario que la
// registró y su Dia_Operativo.
export const listarVentas = asyncHandler(async (req, res) => {
  const { fechaDesde, fechaHasta, diaOperativoId, metodoPago } = req.query
  const where = {}

  if (fechaDesde !== undefined) {
    const d = new Date(fechaDesde)
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'fechaDesde inválida (ISO 8601)')
    where.fechaHora = { ...(where.fechaHora ?? {}), gte: d }
  }
  if (fechaHasta !== undefined) {
    // "Hasta" se interpreta como fin de día (inclusivo): si el valor es solo
    // fecha (YYYY-MM-DD) se extiende a las 23:59:59.999 de ese mismo día, de
    // modo que el filtro incluya todas las ventas de la fecha límite.
    const d = new Date(fechaHasta)
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'fechaHasta inválida (ISO 8601)')
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) d.setUTCHours(23, 59, 59, 999)
    where.fechaHora = { ...(where.fechaHora ?? {}), lte: d }
  }
  if (diaOperativoId !== undefined) {
    where.diaOperativoId = Number(diaOperativoId)
  }
  if (metodoPago !== undefined) {
    if (!esEnumValido(metodoPago, METODOS_PAGO)) {
      throw new HttpError(400, 'metodoPago inválido (Efectivo, Tarjeta o Transferencia)')
    }
    where.metodoPago = metodoPago
  }

  const ventas = await prisma.venta.findMany({
    where,
    orderBy: { fechaHora: 'desc' },
    include: {
      productos: {
        include: {
          producto: { select: { id: true, nombre: true } },
          combo: { select: { id: true, nombre: true } },
          mitadYMitad: true,
          modificadores: { include: { modificador: { select: { id: true, nombre: true } } } },
        },
      },
      usuario: { select: { id: true, tipo: true, nombre: true, usuario: true } },
      diaOperativo: { select: { id: true, estado: true, fechaApertura: true } },
    },
  })
  res.json(ventas)
})

// GET /api/ventas/:id — detalle de una Venta individual incluyendo sus
// Venta_Producto (con sus ids) para el módulo de devoluciones: permite elegir
// productos específicos (venta_producto_ids) o toda la venta.
export const obtenerVenta = asyncHandler(async (req, res) => {
  const { id } = req.params
  const numero = Number(id)
  if (!Number.isInteger(numero) || numero < 1) {
    throw new HttpError(400, 'id de venta inválido')
  }
  const venta = await prisma.venta.findUnique({
    where: { id: numero },
    include: {
      productos: {
        include: {
          producto: { select: { id: true, nombre: true } },
          combo: { select: { id: true, nombre: true } },
          mitadYMitad: {
            include: {
              sabor1Producto: { select: { id: true, nombre: true } },
              sabor2Producto: { select: { id: true, nombre: true } },
            },
          },
          modificadores: { include: { modificador: { select: { id: true, nombre: true } } } },
        },
      },
      devoluciones: {
        orderBy: { fechaHora: 'desc' },
        select: {
          id: true,
          monto: true,
          motivo: true,
          medioDevolucion: true,
          fechaHora: true,
          ventaProductoIds: true,
          cantidadesVentaProducto: true,
        },
      },
    },
  })
  if (!venta) throw new HttpError(404, 'La venta indicada no existe')
  res.json(venta)
})

// GET /api/ventas/no-cobrar — reporte de auditoría de consumo interno
// (docs/04 "Lógica: Consumo interno" y docs/07: solo Administrador). Lista
// SOLO las Venta con no_cobrar=true mostrando producto, costo congelado,
// usuario que la marcó y hora.
export const reporteNoCobrar = asyncHandler(async (_req, res) => {
  const ventas = await prisma.venta.findMany({
    where: { noCobrar: true },
    orderBy: { fechaHora: 'desc' },
    include: {
      productos: {
        include: {
          producto: { select: { id: true, nombre: true } },
          combo: { select: { id: true, nombre: true } },
        },
      },
      usuario: { select: { id: true, tipo: true, nombre: true, usuario: true } },
      diaOperativo: { select: { id: true, estado: true } },
    },
  })

  res.json(
    ventas.map((v) => ({
      id: v.id,
      fechaHora: v.fechaHora,
      total: v.total,
      usuario: {
        id: v.usuario.id,
        tipo: v.usuario.tipo,
        nombre: v.usuario.nombre,
        usuario: v.usuario.usuario,
      },
      diaOperativoId: v.diaOperativoId,
      pedidoId: v.pedidoId,
      productos: agruparProductosNoCobrar(v.productos),
    }))
  )
})

// Agrupa los Venta_Producto de un reporte "No cobrar": cada combo se expande
// en una fila por producto incluido (con precio normal), así que se colapsa
// por comboId mostrando el nombre del combo y su precio cerrado, igual que el
// reporte de Ventas (ReportesPage). Los productos normales se listan con su
// costo congelado.
function agruparProductosNoCobrar(productos) {
  const combos = new Map()
  const normales = []
  for (const vp of productos) {
    if (vp.comboId != null) {
      if (!combos.has(vp.comboId)) {
        combos.set(vp.comboId, {
          producto: vp.combo ? `Combo: ${vp.combo.nombre}` : 'Combo',
          costo: vp.comboPrecioCongelado ?? vp.precioCongelado,
          cantidad: vp.cantidad,
        })
      }
    } else {
      normales.push({
        producto: vp.producto?.nombre ?? null,
        costo: vp.precioCongelado,
        cantidad: vp.cantidad,
      })
    }
  }
  return [...combos.values(), ...normales]
}

export const crearVenta = asyncHandler(async (req, res) => {
  // Toda Venta se asocia SIEMPRE al Dia_Operativo en estado Abierto
  // (docs/04, regla crítica).
  const diaOperativo = await prisma.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
  if (!diaOperativo) {
    throw new HttpError(
      409,
      'No hay una caja abierta (Dia_Operativo en estado Abierto). Abre la caja antes de registrar la venta.'
    )
  }

  const usuarioId = resolverUsuario(req)

  const resultado = await prisma.$transaction((tx) =>
    ejecutarVenta(tx, {
      productos: req.body.productos,
      metodoPago: req.body.metodoPago,
      noCobrar: req.body.noCobrar,
      // Seguridad: es_venta_previa_apertura solo lo asigna internamente abrir
      // caja (Módulo 05). Un valor enviado en el body SIEMPRE se ignora.
      esVentaPreviaApertura: false,
      pedidoId: req.body.pedidoId,
      usarDisponible: req.body.usarDisponible,
      usuarioId,
      diaOperativoId: diaOperativo.id,
    })
  )

  if (resultado.conflicto) {
    return res.status(STOCK_INSUFICIENTE_STATUS).json({
      mensaje: resultado.mensaje,
      stockInsuficiente: resultado.faltantes,
      ...(resultado.opcionesPrecio ? { opcionesPrecio: resultado.opcionesPrecio } : {}),
    })
  }

  res.status(201).json({
    mensaje: 'Venta registrada correctamente',
    venta: resultado.venta,
    movimientosInventario: resultado.usos.map((u) => ({
      tipo: u.tipo,
      id: u.id,
      cantidadDescontada: u.cantidad,
    })),
  })
})
