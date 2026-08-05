import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { METODOS_PAGO, esEnumValido } from '../utils/enums.js'
import {
  stockDe,
  sincronizarStockIngrediente,
  normalizarUsarDisponible,
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
      mapa.delete(m.ingredienteAfectadoId)
      mapa.set(m.ingredienteSustitutoId, (mapa.get(m.ingredienteSustitutoId) || 0) + (basePorUnidad.find((b) => b.ingredienteId === m.ingredienteAfectadoId)?.cantidad || 0))
    }
    registros.push({ modificadorId: m.id, costoAplicado: m.costoAplicado ?? m.costoAdicional })
  }

  return {
    base: [...mapa.entries()].map(([ingredienteId, cantidad]) => ({ ingredienteId, cantidad })),
    registros,
  }
}

// Procesa UN ítem de la venta y acumula sus requerimientos de inventario.
// Devuelve el detalle listo para crear el Venta_Producto.
// `opciones.ignorarEstado` permite recalcular el consumo de un producto ya
// vendido (p. ej. devoluciones) aunque hoy esté inactivo.
// `item.precioCongelado` permite forzar el precio (p. ej. al generar la Venta
// desde un Pedido cuyos precios ya quedaron congelados al capturarse).
export async function procesarItem(tx, item, requerimientos, opciones = {}) {
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

  const cantidad = Number(item.cantidad)
  validarCantidad(cantidad)

  const esMitad = item.esMitadYMitad === true

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

  if (producto.tipo === 'Reventa_directa') {
    if (esMitad) {
      throw new HttpError(400, `El producto "${producto.nombre}" es de reventa directa y no admite mitad y mitad`)
    }
    acumular(requerimientos, 'producto', producto.id, cantidad)
    return {
      productoId: producto.id,
      cantidad,
      precioCongelado,
      esMitadYMitad: false,
      modificadores: [],
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

    // La receta se divide al 50% con REDONDEO HACIA ARRIBA (docs/03 y docs/04).
    const dividirMitad = (ingredientes) =>
      ingredientes.map((x) => ({ ingredienteId: x.ingredienteId, cantidad: Math.ceil(x.cantidad / 2) }))

    const sabor1 = await tx.producto.findUnique({ where: { id: sabor1Id }, include: { productoIngredientes: true } })
    const sabor2 = await tx.producto.findUnique({ where: { id: sabor2Id }, include: { productoIngredientes: true } })
    if (!sabor1) throw new HttpError(404, `El sabor 1 (producto ${sabor1Id}) no existe`)
    if (!sabor2) throw new HttpError(404, `El sabor 2 (producto ${sabor2Id}) no existe`)
    if (sabor1.tipo !== 'Con_receta' || sabor2.tipo !== 'Con_receta') {
      throw new HttpError(400, 'Los sabores de un producto mitad y mitad deben tener receta')
    }

    // El producto base NO consume inventario propio en mitad y mitad: su rol es
    // solo representar precio/tamaño vendido. Solo se descuenta la mitad de la
    // receta de cada sabor (sabor1/2 + sabor2/2), redondeando hacia arriba.
    const porUnidad = [
      ...dividirMitad(sabor1.productoIngredientes),
      ...dividirMitad(sabor2.productoIngredientes),
    ]

    for (const x of porUnidad) {
      acumular(requerimientos, 'ingrediente', x.ingredienteId, x.cantidad * cantidad)
    }

    return {
      productoId: producto.id,
      cantidad,
      precioCongelado,
      esMitadYMitad: true,
      sabor1ProductoId: sabor1.id,
      sabor2ProductoId: sabor2.id,
      modificadores: registros,
    }
  }

  for (const x of base) {
    acumular(requerimientos, 'ingrediente', x.ingredienteId, x.cantidad * cantidad)
  }

  return {
    productoId: producto.id,
    cantidad,
    precioCongelado,
    esMitadYMitad: false,
    modificadores: registros,
  }
}

// Recalcula el consumo de inventario de un Venta_Producto ya guardado (usado
// por devoluciones parciales para saber QUÉ ingredientes regresar). Reutiliza
// la misma lógica de procesarItem (modificadores, mitad y mitad, reventa).
// Devuelve un Map `'ingrediente:id'|'producto:id' -> cantidad`.
export async function calcularConsumoVentaProducto(tx, ventaProducto, opciones = {}) {
  const requerimientos = new Map()
  const item = {
    productoId: ventaProducto.productoId,
    cantidad: ventaProducto.cantidad,
    esMitadYMitad: ventaProducto.esMitadYMitad,
  }
  if (ventaProducto.esMitadYMitad && ventaProducto.mitadYMitad) {
    item.sabor1ProductoId = ventaProducto.mitadYMitad.sabor1ProductoId
    item.sabor2ProductoId = ventaProducto.mitadYMitad.sabor2ProductoId
  }
  if (Array.isArray(ventaProducto.modificadores) && ventaProducto.modificadores.length > 0) {
    item.modificadores = ventaProducto.modificadores.map((m) => ({ modificadorId: m.modificadorId }))
  }
  await procesarItem(tx, item, requerimientos, opciones)
  return requerimientos
}

// Calcula el subtotal de una lista de ítems ya procesados (misma fórmula que
// `ejecutarVenta`). Se usa para recalcular el total de un Pedido al editarse.
export function calcularTotalItems(itemsProcesados) {
  let total = 0
  for (const d of itemsProcesados) {
    const subtotalModificadores = d.modificadores.reduce((acc, m) => acc + m.costoAplicado, 0)
    total += (d.precioCongelado + subtotalModificadores) * d.cantidad
  }
  return total
}

// Crea una Venta reutilizando la lógica del Módulo 04. Se ejecuta dentro de la
// transacción del llamador (`tx`), de modo que puede componerse con otras
// operaciones (p. ej. ventas previas a apertura dentro de abrir caja — Módulo 05).
// Devuelve { conflicto, faltantes, mensaje } si falta stock sin confirmar, o
// { venta, usos } si se registró correctamente.
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

  const confirmados = normalizarUsarDisponible(usarDisponible)
  const confirmarTodo = usarDisponible === true

  // 1) Calcular cuánto consume cada ítem y acumular requerimientos.
  const requerimientos = new Map()
  const itemsProcesados = []
  for (const item of productos) {
    const detalle = await procesarItem(tx, item, requerimientos)
    itemsProcesados.push(detalle)
  }

  // 2) Validar stock contra la suma de movimientos de cada cuenta.
  const stocks = new Map()
  const faltantes = []
  for (const [key, requerido] of requerimientos) {
    const [tipo, id] = key.split(':')
    const disponible = await stockDe(tx, tipo, Number(id))
    stocks.set(key, disponible)
    if (disponible < requerido) {
      faltantes.push({ tipo, id: Number(id), requerido, disponible })
    }
  }

  // 3) Si falta stock y el usuario NO confirmó esos ingredientes: responder
  //    con la cantidad disponible, SIN completar la venta.
  const sinConfirmar = faltantes.filter(
    (f) => !confirmarTodo && !confirmados.has(`${f.tipo}:${f.id}`)
  )
  if (sinConfirmar.length > 0) {
    return {
      conflicto: true,
      faltantes,
      mensaje:
        'Stock insuficiente. Confirma qué ingredientes se usarán con la cantidad disponible para continuar (usarDisponible).',
    }
  }

  // 4) Calcular la cantidad REAL a descontar: para los confirmados con stock
  //    insuficiente se descuenta solo lo disponible (queda en 0, no negativo).
  const usos = []
  for (const [key, requerido] of requerimientos) {
    const [tipo, id] = key.split(':')
    const disponible = stocks.get(key)
    if (disponible >= requerido) {
      usos.push({ tipo, id: Number(id), cantidad: requerido })
    } else if (confirmarTodo || confirmados.has(key)) {
      usos.push({ tipo, id: Number(id), cantidad: disponible })
    } else {
      // No debería llegar: sinConfirmar habría frenado antes.
      usos.push({ tipo, id: Number(id), cantidad: requerido })
    }
  }

  // 5) Crear la Venta y sus detalles dentro de la misma transacción.
  let total = 0
  const detalleProductos = itemsProcesados.map((d) => {
    const subtotalModificadores = d.modificadores.reduce((acc, m) => acc + m.costoAplicado, 0)
    total += (d.precioCongelado + subtotalModificadores) * d.cantidad
    return d
  })

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

  for (const d of detalleProductos) {
    const ventaProducto = await tx.venta_Producto.create({
      data: {
        ventaId: venta.id,
        productoId: d.productoId,
        cantidad: d.cantidad,
        precioCongelado: d.precioCongelado,
        esMitadYMitad: d.esMitadYMitad,
      },
    })

    if (d.esMitadYMitad) {
      await tx.venta_Producto_Mitad.create({
        data: {
          ventaProductoId: ventaProducto.id,
          sabor1ProductoId: d.sabor1ProductoId,
          sabor2ProductoId: d.sabor2ProductoId,
        },
      })
    }

    for (const m of d.modificadores) {
      await tx.venta_Producto_Modificador.create({
        data: {
          ventaProductoId: ventaProducto.id,
          modificadorId: m.modificadorId,
          costoAplicado: m.costoAplicado,
        },
      })
    }
  }

  // 6) Movimiento_Inventario tipo Salida_venta, uno por cuenta, con la
  //    cantidad REAL usada (negativa) y referencia a la venta.
  for (const u of usos) {
    await tx.movimiento_Inventario.create({
      data: {
        ...(u.tipo === 'ingrediente'
          ? { ingredienteId: u.id }
          : { productoId: u.id }),
        tipoMovimiento: 'Salida_venta',
        cantidad: -u.cantidad,
        referenciaId: venta.id,
        referenciaTipo: 'Venta',
      },
    })
    if (u.tipo === 'ingrediente') {
      await sincronizarStockIngrediente(tx, u.id)
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
          mitadYMitad: true,
          modificadores: { include: { modificador: { select: { id: true, nombre: true } } } },
        },
      },
      diaOperativo: { select: { id: true, estado: true } },
    },
  })
  return { venta: creada, usos }
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
      esVentaPreviaApertura: req.body.esVentaPreviaApertura,
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