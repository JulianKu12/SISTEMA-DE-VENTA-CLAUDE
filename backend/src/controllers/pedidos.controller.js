import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import {
  TIPOS_PEDIDO,
  ORIGENES_PEDIDO,
  ESTADOS_PREPARACION,
  ESTADOS_PAGO,
  METODOS_PAGO,
  esEnumValido,
} from '../utils/enums.js'
import { sincronizarStockIngrediente } from '../utils/inventario.js'
import {
  procesarItem,
  calcularTotalItems,
  ejecutarVenta,
} from './ventas.controller.js'
import { obtenerConfiguracion } from './config.controller.js'

const includePedido = {
  cliente: { select: { id: true, nombre: true, telefono: true } },
  referencia: true,
  repartidor: { select: { id: true, nombre: true, estadoDisponibilidad: true } },
  venta: { select: { id: true, total: true, metodoPago: true, noCobrar: true } },
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
}

// Validación cruzada de metodo_pago según el tipo de pedido (docs/06):
//   Para_recoger -> Efectivo, Tarjeta, Transferencia
//   A_domicilio  -> Efectivo, Transferencia (el repartidor no carga terminal)
function validarMetodoPago(tipo, metodoPago) {
  if (metodoPago === undefined) return 'Efectivo'
  if (!esEnumValido(metodoPago, METODOS_PAGO)) {
    throw new HttpError(400, 'metodoPago inválido (Efectivo, Tarjeta o Transferencia)')
  }
  if (tipo === 'A_domicilio' && metodoPago === 'Tarjeta') {
    throw new HttpError(400, 'Un pedido A_domicilio no admite Tarjeta (solo Efectivo o Transferencia)')
  }
  return metodoPago
}

// Convierte los Pedido_Producto ya guardados al formato que acepta ejecutarVenta,
// conservando los precios/costos congelados al momento de capturar el pedido.
// Los ítems de combo se reagrupan por comboId (el combo se guarda expandido en
// varias filas, una por producto incluido) y se conserva el precio del combo.
async function productosDesdePedido(tx, pedido) {
  const productos = await tx.pedido_Producto.findMany({
    where: { pedidoId: pedido.id },
    include: { mitadYMitad: true, modificadores: true },
  })

  const items = []
  const gruposCombo = new Map()
  for (const pp of productos) {
    if (pp.comboId) {
      if (!gruposCombo.has(pp.comboId)) {
        gruposCombo.set(pp.comboId, { comboPrecioCongelado: pp.comboPrecioCongelado, filas: [] })
      }
      gruposCombo.get(pp.comboId).filas.push(pp)
    } else {
      items.push({
        productoId: pp.productoId,
        cantidad: pp.cantidad,
        esMitadYMitad: pp.esMitadYMitad,
        precioCongelado: pp.precioCongelado,
        pedidoProductoId: pp.id,
        ...(pp.esMitadYMitad && pp.mitadYMitad
          ? {
              sabor1ProductoId: pp.mitadYMitad.sabor1ProductoId,
              sabor2ProductoId: pp.mitadYMitad.sabor2ProductoId,
            }
          : {}),
        modificadores: pp.modificadores.map((m) => ({
          modificadorId: m.modificadorId,
          costoAplicado: m.costoAplicado,
        })),
      })
    }
  }

  for (const [comboId, g] of gruposCombo) {
    const combo = await tx.combo.findUnique({
      where: { id: comboId },
      include: { productos: true },
    })
    if (!combo) throw new HttpError(404, `El combo ${comboId} del pedido no existe`)
    const cpCant =
      combo.productos.find((cp) => cp.productoId === g.filas[0].productoId)?.cantidad || 1
    items.push({
      comboId,
      cantidad: g.filas[0].cantidad / cpCant,
      precioCongelado: g.comboPrecioCongelado ?? combo.precioEspecial,
      pedidoProductos: g.filas.map((f) => ({ productoId: f.productoId, pedidoProductoId: f.id })),
    })
  }

  return items
}

export const crearPedido = asyncHandler(async (req, res) => {
  const {
    tipo,
    origen,
    clienteId,
    nombreClienteLibre,
    referenciaId,
    productos,
    metodoPago,
    montoReferenciaPago,
    noCobrar = false,
    usarDisponible,
  } = req.body

  if (!esEnumValido(tipo, TIPOS_PEDIDO)) {
    throw new HttpError(400, 'tipo inválido (Para_recoger o A_domicilio)')
  }
  if (!esEnumValido(origen, ORIGENES_PEDIDO)) {
    throw new HttpError(400, 'origen inválido (Mostrador o Telefono)')
  }
  if (!Array.isArray(productos) || productos.length === 0) {
    throw new HttpError(400, 'Un pedido requiere al menos un producto')
  }
  if (referenciaId != null && tipo !== 'A_domicilio') {
    throw new HttpError(400, 'referenciaId solo aplica a pedidos A_domicilio')
  }
  const montoResuelto = validarMetodoPago(tipo, noCobrar ? 'Efectivo' : metodoPago)

  const usuarioId = resolverUsuario(req)

  const resultado = await prisma.$transaction(async (tx) => {
    // Cliente: o el registrado (clienteId) o el nombre libre; ambos opcionales.
    if (clienteId != null) {
      const cliente = await tx.cliente.findUnique({ where: { id: Number(clienteId) } })
      if (!cliente) throw new HttpError(404, 'El cliente indicado no existe')
    }
    if (referenciaId != null) {
      const referencia = await tx.cliente_Referencia.findUnique({ where: { id: Number(referenciaId) } })
      if (!referencia) throw new HttpError(404, 'La referencia indicada no existe')
    }

    // Procesar los ítems (valida productos/combos/modificadores y congela precios).
    const itemsProcesados = []
    for (const item of productos) {
      itemsProcesados.push(await procesarItem(tx, item))
    }
    const totalProductos = calcularTotalItems(itemsProcesados)

    // costo_envio: automático si A_domicilio (docs/06), omitido si no_cobrar.
    const config = await obtenerConfiguracion(tx)
    const esDomicilio = tipo === 'A_domicilio'
    const costoEnvio = esDomicilio && !noCobrar ? config.costoEnvio : null
    const total = totalProductos + (costoEnvio ?? 0)

    // cambio_a_llevar: obligatorio si Efectivo y no_cobrar=false.
    let montoReferencia = null
    let cambioALlevar = null
    if (montoResuelto === 'Efectivo' && !noCobrar) {
      if (typeof montoReferenciaPago !== 'number' || montoReferenciaPago < total) {
        throw new HttpError(400, 'montoReferenciaPago es obligatorio (Efectivo, no_cobrar=false) y debe cubrir el total')
      }
      montoReferencia = montoReferenciaPago
      cambioALlevar = montoReferencia - total
    } else if (montoReferenciaPago != null) {
      throw new HttpError(400, 'montoReferenciaPago solo aplica si metodoPago=Efectivo y no_cobrar=false')
    }

    // monto_referencia_pago debe estar dentro de las opciones de cambio
    // configuradas (docs/07). Un monto no configurado -> 400 con error claro.
    if (montoReferencia != null && !(config.opcionesCambio ?? []).includes(montoReferencia)) {
      throw new HttpError(
        400,
        `montoReferenciaPago (${montoReferencia}) no está dentro de las opciones de cambio configuradas: ${(config.opcionesCambio ?? []).join(', ')}`
      )
    }

    // estado_pago inicial (docs/06): Mostrador + Para_recoger cobra al capturar.
    const estadoPagoInicial =
      origen === 'Mostrador' && tipo === 'Para_recoger' ? 'Pagado' : 'Pendiente_pago'

    const pedido = await tx.pedido.create({
      data: {
        tipo,
        origen,
        estadoPreparacion: 'Pendiente',
        estadoPago: estadoPagoInicial,
        clienteId: clienteId != null ? Number(clienteId) : null,
        nombreClienteLibre: nombreClienteLibre ?? null,
        referenciaId: referenciaId != null ? Number(referenciaId) : null,
        costoEnvio,
        repartidorId: null,
        metodoPago: noCobrar ? 'Efectivo' : montoResuelto,
        montoReferenciaPago: montoReferencia,
        cambioALlevar,
        noCobrar,
        total,
      },
    })

    // Crear los Pedido_Producto (un combo se expande en una fila por producto
    // incluido, todas con el mismo comboId) y preparar los ítems congelados que
    // se reutilizarán si el pedido genera su Venta en este mismo flujo.
    const itemsVenta = []
    for (const it of itemsProcesados) {
      if (it.tipo === 'combo') {
        const filas = []
        for (const dp of it.detalleProductos) {
          const pp = await tx.pedido_Producto.create({
            data: {
              pedidoId: pedido.id,
              productoId: dp.productoId,
              cantidad: dp.cantidad,
              precioCongelado: dp.precioCongelado,
              esMitadYMitad: false,
              comboId: it.comboId,
              comboPrecioCongelado: it.comboPrecioCongelado,
            },
          })
          filas.push({ productoId: dp.productoId, pedidoProductoId: pp.id })
        }
        itemsVenta.push({
          comboId: it.comboId,
          cantidad: it.cantidad,
          precioCongelado: it.comboPrecioCongelado,
          pedidoProductos: filas,
        })
      } else {
        const d = it.detalle
        const pp = await tx.pedido_Producto.create({
          data: {
            pedidoId: pedido.id,
            productoId: d.productoId,
            cantidad: d.cantidad,
            precioCongelado: d.precioCongelado,
            esMitadYMitad: d.esMitadYMitad,
          },
        })
        if (d.esMitadYMitad) {
          await tx.pedido_Producto_Mitad.create({
            data: {
              pedidoProductoId: pp.id,
              sabor1ProductoId: d.sabor1ProductoId,
              sabor2ProductoId: d.sabor2ProductoId,
            },
          })
        }
        for (const m of d.modificadores) {
          await tx.pedido_Producto_Modificador.create({
            data: { pedidoProductoId: pp.id, modificadorId: m.modificadorId, costoAplicado: m.costoAplicado },
          })
        }
        itemsVenta.push({
          productoId: d.productoId,
          cantidad: d.cantidad,
          esMitadYMitad: d.esMitadYMitad,
          precioCongelado: d.precioCongelado,
          pedidoProductoId: pp.id,
          ...(d.esMitadYMitad
            ? { sabor1ProductoId: d.sabor1ProductoId, sabor2ProductoId: d.sabor2ProductoId }
            : {}),
          modificadores: d.modificadores,
        })
      }
    }

    // Si inicia Pagado, generar la Venta inmediatamente (docs/04 y docs/06).
    let venta = null
    if (estadoPagoInicial === 'Pagado') {
      const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
      if (!dia) {
        throw new HttpError(
          409,
          'No hay una caja abierta (Dia_Operativo Abierto). Abre la caja para cobrar el pedido al capturarlo.'
        )
      }
      const r = await ejecutarVenta(tx, {
        productos: itemsVenta,
        metodoPago: noCobrar ? 'Efectivo' : montoResuelto,
        noCobrar,
        pedidoId: pedido.id,
        costoEnvio: costoEnvio ?? 0,
        usarDisponible,
        usuarioId,
        diaOperativoId: dia.id,
      })
      if (r.conflicto) {
        const e = new HttpError(409, `No se pudo cobrar el pedido: ${r.mensaje}`)
        e.faltantes = r.faltantes
        throw e
      }
      venta = r.venta
    }

    return tx.pedido.findUnique({ where: { id: pedido.id }, include: includePedido })
  })

  res.status(201).json(resultado)
})

export const listarPedidos = asyncHandler(async (req, res) => {
  const { estadoPreparacion } = req.query
  const where = {}
  if (estadoPreparacion != null) {
    if (!esEnumValido(estadoPreparacion, ESTADOS_PREPARACION)) {
      throw new HttpError(400, 'estadoPreparacion inválido')
    }
    where.estadoPreparacion = estadoPreparacion
  }
  const pedidos = await prisma.pedido.findMany({
    where,
    include: includePedido,
    orderBy: { fechaHoraCreacion: 'desc' },
  })
  res.json(pedidos)
})

export const detallePedido = asyncHandler(async (req, res) => {
  const { id } = req.params
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(id) },
    include: includePedido,
  })
  if (!pedido) throw new HttpError(404, 'Pedido no encontrado')
  res.json(pedido)
})

export const pedidosPorRepartidor = asyncHandler(async (req, res) => {
  const { repartidorId } = req.params
  const repartidor = await prisma.empleado.findUnique({ where: { id: Number(repartidorId) } })
  if (!repartidor) throw new HttpError(404, 'Repartidor no encontrado')
  const pedidos = await prisma.pedido.findMany({
    where: { repartidorId: repartidor.id },
    include: includePedido,
    orderBy: { fechaHoraCreacion: 'desc' },
  })
  res.json(pedidos)
})

// Pasa un pedido Pendiente_pago a Pagado, generando automáticamente la Venta.
export const cambiarEstadoPago = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { estadoPago, usarDisponible } = req.body
  if (estadoPago !== 'Pagado') {
    throw new HttpError(400, 'Solo se permite pasar estado_pago a Pagado')
  }

  const usuarioId = resolverUsuario(req)

  const resultado = await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({
      where: { id: Number(id) },
      include: { productos: { include: { mitadYMitad: true, modificadores: true } } },
    })
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado')
    if (pedido.estadoPago === 'Pagado') {
      throw new HttpError(400, 'El pedido ya está Pagado')
    }
    if (pedido.estadoPreparacion === 'Cancelado') {
      throw new HttpError(400, 'Un pedido Cancelado no puede pasar a Pagado')
    }

    const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
    if (!dia) {
      throw new HttpError(409, 'No hay una caja abierta (Dia_Operativo Abierto). Abre la caja para registrar el pago.')
    }

    const r = await ejecutarVenta(tx, {
      productos: await productosDesdePedido(tx, pedido),
      metodoPago: pedido.noCobrar ? 'Efectivo' : pedido.metodoPago,
      noCobrar: pedido.noCobrar,
      pedidoId: pedido.id,
      costoEnvio: pedido.costoEnvio ?? 0,
      usarDisponible,
      usuarioId,
      diaOperativoId: dia.id,
    })
    if (r.conflicto) {
      const e = new HttpError(409, `No se pudo registrar el pago: ${r.mensaje}`)
      e.faltantes = r.faltantes
      throw e
    }

    const actualizado = await tx.pedido.update({
      where: { id: pedido.id },
      data: { estadoPago: 'Pagado' },
    })
    return {
      pedido: await tx.pedido.findUnique({ where: { id: pedido.id }, include: includePedido }),
      venta: r.venta,
      actualizado,
    }
  })

  res.json({
    mensaje: 'Pedido pagado. Venta generada automáticamente.',
    pedido: resultado.pedido,
    venta: resultado.venta,
  })
})

// Matriz de transiciones válidas de estado_preparacion (docs/06):
//   Pendiente/En_preparacion -> Enviado (solo A_domicilio, con repartidor)
//   Pendiente/En_preparacion/Enviado -> Entregado
//   Cualquiera antes de Entregado -> Cancelado (requiere regresa_a_inventario)
const TRANSICIONES = {
  Pendiente: ['En_preparacion', 'Enviado', 'Entregado', 'Cancelado'],
  En_preparacion: ['Enviado', 'Entregado', 'Cancelado'],
  Enviado: ['Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: [],
}

// Regresa al inventario el consumo del pedido al cancelarse (solo aplica si el
// pedido ya generó su Venta: si no, nada fue descontado aún). Revierten los
// Movimiento_Inventario Salida_venta EXACTOS de esa Venta (con modificadores,
// mitad y mitad, usar_disponible y combos ya aplicados) — nunca se recalcula
// con la receta actual (evita el drift si cambió la receta).
async function regresarInventarioDePedido(tx, pedido) {
  if (!pedido.ventaId) return 0
  const salidas = await tx.movimiento_Inventario.findMany({
    where: { referenciaId: pedido.ventaId, referenciaTipo: 'Venta', tipoMovimiento: 'Salida_venta' },
  })
  let movimientos = 0
  for (const mv of salidas) {
    await tx.movimiento_Inventario.create({
      data: {
        ...(mv.ingredienteId != null
          ? { ingredienteId: mv.ingredienteId }
          : { productoId: mv.productoId }),
        tipoMovimiento: 'Cancelacion_regreso',
        cantidad: -mv.cantidad,
        referenciaId: pedido.id,
        referenciaTipo: 'Cancelacion',
      },
    })
    movimientos++
    if (mv.ingredienteId != null) {
      await sincronizarStockIngrediente(tx, mv.ingredienteId)
    }
  }
  return movimientos
}

export const cambiarEstadoPreparacion = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { estadoPreparacion, repartidorId, regresaAInventario } = req.body

  if (!esEnumValido(estadoPreparacion, ESTADOS_PREPARACION)) {
    throw new HttpError(400, 'estadoPreparacion inválido')
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({ where: { id: Number(id) } })
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado')

    const permitidas = TRANSICIONES[pedido.estadoPreparacion] || []
    if (!permitidas.includes(estadoPreparacion)) {
      throw new HttpError(
        400,
        `No se puede pasar un pedido ${pedido.estadoPreparacion} a ${estadoPreparacion}`
      )
    }

    const data = { estadoPreparacion }

    if (estadoPreparacion === 'Enviado') {
      if (pedido.tipo !== 'A_domicilio') {
        throw new HttpError(400, 'Solo un pedido A_domicilio puede pasar a Enviado')
      }
      const config = await obtenerConfiguracion(tx)
      let repartidorAsignado = repartidorId != null ? Number(repartidorId) : null

      if (config.repartidorUnico && repartidorAsignado == null) {
        // Repartidor único: se asigna automáticamente el único Disponible.
        const disponibles = await tx.empleado.findMany({ where: { estadoDisponibilidad: 'Disponible' } })
        if (disponibles.length !== 1) {
          throw new HttpError(409, 'No hay un único repartidor Disponible para asignar automáticamente')
        }
        repartidorAsignado = disponibles[0].id
      }

      if (repartidorAsignado == null) {
        throw new HttpError(400, 'repartidorId es obligatorio para pasar a Enviado (o activa "repartidor único")')
      }
      const repartidor = await tx.empleado.findUnique({ where: { id: repartidorAsignado } })
      if (!repartidor) throw new HttpError(404, 'El repartidor indicado no existe')
      if (repartidor.estadoDisponibilidad !== 'Disponible') {
        throw new HttpError(400, `El repartidor no está Disponible (estado: ${repartidor.estadoDisponibilidad})`)
      }
      data.repartidorId = repartidorAsignado
    }

    let movimientosRegreso = 0
    if (estadoPreparacion === 'Cancelado') {
      if (typeof regresaAInventario !== 'boolean') {
        throw new HttpError(400, 'regresaAInventario (booleano) es obligatorio al cancelar un pedido')
      }
      if (regresaAInventario) {
        movimientosRegreso = await regresarInventarioDePedido(tx, pedido)
      }
    }

    await tx.pedido.update({ where: { id: pedido.id }, data })
    return {
      pedido: await tx.pedido.findUnique({ where: { id: pedido.id }, include: includePedido }),
      movimientosRegreso,
    }
  })

  res.json({
    mensaje: 'Estado de preparación actualizado',
    pedido: resultado.pedido,
    movimientosCancelacionRegreso: resultado.movimientosRegreso,
  })
})

// Edición de un pedido activo (Pendiente o En_preparacion): agregar y/o quitar
// productos. Al quitar, se recalcula el total y el cambio_a_llevar.
export const editarPedido = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { agregarProductos, quitarProductos } = req.body

  const resultado = await prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({ where: { id: Number(id) } })
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado')
    if (!['Pendiente', 'En_preparacion'].includes(pedido.estadoPreparacion)) {
      throw new HttpError(400, 'Un pedido solo se edita en estado Pendiente o En_preparacion')
    }

    // Quitar productos: cada uno requiere regresa_a_inventario.
    if (Array.isArray(quitarProductos) && quitarProductos.length > 0) {
      for (const q of quitarProductos) {
        if (!q?.pedidoProductoId) throw new HttpError(400, 'cada quitarProducto requiere pedidoProductoId')
        if (typeof q.regresaAInventario !== 'boolean') {
          throw new HttpError(400, 'regresaAInventario (booleano) es obligatorio al quitar un producto')
        }
        const pp = await tx.pedido_Producto.findFirst({
          where: { id: Number(q.pedidoProductoId), pedidoId: pedido.id },
          include: { mitadYMitad: true, modificadores: true },
        })
        if (!pp) throw new HttpError(404, 'El pedidoProductoId indicado no pertenece a este pedido')

        if (q.regresaAInventario && pedido.ventaId) {
          // Revertir EXACTAMENTE las Salida_venta de ese Pedido_Producto (con
          // los descuentos reales ya aplicados), sin recalcular con la receta.
          const salidas = await tx.movimiento_Inventario.findMany({
            where: { pedidoProductoId: pp.id, tipoMovimiento: 'Salida_venta' },
          })
          for (const mv of salidas) {
            await tx.movimiento_Inventario.create({
              data: {
                ...(mv.ingredienteId != null
                  ? { ingredienteId: mv.ingredienteId }
                  : { productoId: mv.productoId }),
                tipoMovimiento: 'Cancelacion_regreso',
                cantidad: -mv.cantidad,
                referenciaId: pedido.id,
                referenciaTipo: 'Cancelacion',
              },
            })
            if (mv.ingredienteId != null) {
              await sincronizarStockIngrediente(tx, mv.ingredienteId)
            }
          }
        }
        await tx.pedido_Producto_Modificador.deleteMany({ where: { pedidoProductoId: pp.id } })
        await tx.pedido_Producto_Mitad.deleteMany({ where: { pedidoProductoId: pp.id } })
        await tx.pedido_Producto.delete({ where: { id: pp.id } })
      }
    }

    // Agregar productos: se congelan precios/costos al momento. Un combo se
    // expande en una fila por producto incluido (todas con el mismo comboId).
    if (Array.isArray(agregarProductos) && agregarProductos.length > 0) {
      for (const item of agregarProductos) {
        const it = await procesarItem(tx, item)
        if (it.tipo === 'combo') {
          for (const dp of it.detalleProductos) {
            await tx.pedido_Producto.create({
              data: {
                pedidoId: pedido.id,
                productoId: dp.productoId,
                cantidad: dp.cantidad,
                precioCongelado: dp.precioCongelado,
                esMitadYMitad: false,
                comboId: it.comboId,
                comboPrecioCongelado: it.comboPrecioCongelado,
              },
            })
          }
        } else {
          const d = it.detalle
          const pp = await tx.pedido_Producto.create({
            data: {
              pedidoId: pedido.id,
              productoId: d.productoId,
              cantidad: d.cantidad,
              precioCongelado: d.precioCongelado,
              esMitadYMitad: d.esMitadYMitad,
            },
          })
          if (d.esMitadYMitad) {
            await tx.pedido_Producto_Mitad.create({
              data: {
                pedidoProductoId: pp.id,
                sabor1ProductoId: d.sabor1ProductoId,
                sabor2ProductoId: d.sabor2ProductoId,
              },
            })
          }
          for (const m of d.modificadores) {
            await tx.pedido_Producto_Modificador.create({
              data: { pedidoProductoId: pp.id, modificadorId: m.modificadorId, costoAplicado: m.costoAplicado },
            })
          }
        }
      }
    }

    // Recalcular total y cambio_a_llevar. Las filas de un combo contribuyen con
    // el precio del combo (comboPrecioCongelado x unidades de combo), no con la
    // suma de precios de sus productos.
    const productosFinales = await tx.pedido_Producto.findMany({
      where: { pedidoId: pedido.id },
      include: { modificadores: true },
    })
    const comboIds = [...new Set(productosFinales.filter((p) => p.comboId).map((p) => p.comboId))]
    const mapaCp = new Map()
    if (comboIds.length) {
      const combos = await tx.combo.findMany({
        where: { id: { in: comboIds } },
        include: { productos: true },
      })
      for (const c of combos) {
        for (const cp of c.productos) mapaCp.set(`${c.id}:${cp.productoId}`, cp.cantidad)
      }
    }
    let total = 0
    for (const pp of productosFinales) {
      if (pp.comboId) {
        const cpCant = mapaCp.get(`${pp.comboId}:${pp.productoId}`) ?? 1
        total += pp.comboPrecioCongelado * (pp.cantidad / cpCant)
      } else {
        const subtotalModificadores = pp.modificadores.reduce((acc, m) => acc + m.costoAplicado, 0)
        total += (pp.precioCongelado + subtotalModificadores) * pp.cantidad
      }
    }
    total += pedido.costoEnvio ?? 0

    let cambioALlevar = pedido.cambioALlevar
    if (pedido.metodoPago === 'Efectivo' && !pedido.noCobrar && pedido.montoReferenciaPago != null) {
      if (pedido.montoReferenciaPago < total) {
        throw new HttpError(400, 'El montoReferenciaPago ya no cubre el nuevo total tras la edición')
      }
      cambioALlevar = pedido.montoReferenciaPago - total
    }

    await tx.pedido.update({ where: { id: pedido.id }, data: { total, cambioALlevar } })
    return tx.pedido.findUnique({ where: { id: pedido.id }, include: includePedido })
  })

  res.json({ mensaje: 'Pedido editado y total recalculado', pedido: resultado })
})
