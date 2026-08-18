import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { MOTIVOS_DEVOLUCION, MEDIOS_DEVOLUCION, esEnumValido } from '../utils/enums.js'
import { sincronizarStockIngrediente } from '../utils/inventario.js'

// Crea una Devolución reutilizando la lógica del endpoint POST /api/devoluciones.
// Se ejecuta DENTRO de la transacción del llamador (`tx`), de modo que puede
// componerse con otras operaciones (p. ej. cancelar un Pedido Pagado y devolver
// el dinero — Módulo 06). Devuelve { devolucion, regresos, asociadaASiguienteDia }.
export async function crearDevolucionTx(tx, {
  ventaId,
  monto,
  motivo,
  regresaAInventario = false,
  medioDevolucion,
  ventaProductoIds,
  cantidades = {},
}) {
  if (!ventaId) throw new HttpError(400, 'ventaId es obligatorio')
  if (typeof monto !== 'number' || monto < 0) {
    throw new HttpError(400, 'monto debe ser un número mayor o igual a 0')
  }
  if (!esEnumValido(motivo, MOTIVOS_DEVOLUCION)) {
    throw new HttpError(400, 'motivo inválido (Producto_mal_estado, Pedido_incorrecto, Cliente_insatisfecho, Cancelacion_pedido u Otro)')
  }
  if (!esEnumValido(medioDevolucion, MEDIOS_DEVOLUCION)) {
    throw new HttpError(400, 'medioDevolucion inválido (Efectivo, Tarjeta, Transferencia o Efectivo_de_caja)')
  }

  {
    // La Venta original NO se modifica ni se borra (se mantiene para trazabilidad).
    const venta = await tx.venta.findUnique({ where: { id: Number(ventaId) } })
    if (!venta) throw new HttpError(404, 'La venta indicada no existe')

    // Devolución PARCIAL: valida que los Venta_Producto pertenezcan a la venta
    // y que la CANTIDAD a devolver de cada línea no exceda lo que queda sin
    // devolver (cantidad original de la línea - suma de cantidades ya devueltas
    // previamente de esa misma línea). Así una línea de 20 unidades puede
    // devolverse en partes (ej. 10 y luego 10), pero no en exceso (ej. 15).
    let idsProductos = null
    let cantidadesGuardar = null
    if (Array.isArray(ventaProductoIds) && ventaProductoIds.length > 0) {
      idsProductos = [...new Set(ventaProductoIds.map(Number))]
      const ventaProductos = await tx.venta_Producto.findMany({
        where: { id: { in: idsProductos }, ventaId: venta.id },
        select: { id: true, cantidad: true, precioCongelado: true },
      })
      if (ventaProductos.length !== idsProductos.length) {
        throw new HttpError(400, 'Alguno de los ventaProductoIds no pertenece a la venta indicada')
      }
      const porId = new Map(ventaProductos.map((vp) => [vp.id, vp]))

      // Cantidad ya devuelta POR LÍNEA: suma las cantidades parciales previas
      // (cantidadesVentaProducto). Los registros viejos sin cantidades se
      // interpretan como la línea completa devuelta.
      const previas = await tx.devolucion.findMany({
        where: { ventaId: venta.id, ventaProductoIds: { not: null } },
        select: { ventaProductoIds: true, cantidadesVentaProducto: true },
      })
      const yaDevuelto = new Map()
      for (const d of previas) {
        let ids
        try {
          ids = JSON.parse(d.ventaProductoIds || '[]')
        } catch {
          continue
        }
        let cants = {}
        try {
          cants = JSON.parse(d.cantidadesVentaProducto || '{}')
        } catch {
          continue
        }
        for (const id of ids) {
          const key = Number(id)
          const cantidadPrevia = cants[key] ?? porId.get(key)?.cantidad ?? 0
          yaDevuelto.set(key, (yaDevuelto.get(key) || 0) + cantidadPrevia)
        }
      }

      // Valida la cantidad solicitada de cada línea seleccionada.
      cantidadesGuardar = {}
      for (const id of idsProductos) {
        const vp = porId.get(id)
        const cantidadSolicitada =
          cantidades[id] != null ? Number(cantidades[id]) : vp.cantidad
        if (!Number.isInteger(cantidadSolicitada) || cantidadSolicitada < 1) {
          throw new HttpError(400, 'La cantidad a devolver debe ser un entero mayor o igual a 1')
        }
        const remanente = vp.cantidad - (yaDevuelto.get(id) || 0)
        if (cantidadSolicitada > remanente) {
          throw new HttpError(
            400,
            remanente <= 0
              ? 'Alguno de los productos seleccionados ya fue devuelto previamente (devolución duplicada)'
              : `Solo quedan ${remanente} de ${vp.cantidad} unidad(es) por devolver de esa línea`,
          )
        }
        cantidadesGuardar[id] = cantidadSolicitada
      }

      // Límite (docs): la suma de devoluciones de una venta no puede EXCEDER el
      // monto que el cliente pagó. Esto bloquea devoluciones duplicadas (doble
      // clic o reintento) y devoluciones parciales que sobrepasen lo vendido.
      // Va después de la validación por línea para que, al intentar devolver
      // más cantidad de la pendiente, el error precise el remanente disponible.
      const devolucionesPrevias = await tx.devolucion.aggregate({
        _sum: { monto: true },
        where: { ventaId: venta.id },
      })
      const montoYaDevuelto = devolucionesPrevias._sum.monto ?? 0
      if (montoYaDevuelto + monto > venta.total) {
        throw new HttpError(
          400,
          `La devolución excede el monto pagado de la venta (ya se devolvieron ${montoYaDevuelto} de ${venta.total})`
        )
      }
    } else {
      // Devolución COMPLETA: el límite de monto se revisa primero (excede el
      // pagado) y luego se bloquea si la venta ya tiene devoluciones previas.
      const devolucionesPrevias = await tx.devolucion.aggregate({
        _sum: { monto: true },
        where: { ventaId: venta.id },
      })
      const montoYaDevuelto = devolucionesPrevias._sum.monto ?? 0
      if (montoYaDevuelto + monto > venta.total) {
        throw new HttpError(
          400,
          `La devolución excede el monto pagado de la venta (ya se devolvieron ${montoYaDevuelto} de ${venta.total})`
        )
      }
      const devolucionesPreviasCount = await tx.devolucion.count({ where: { ventaId: venta.id } })
      if (devolucionesPreviasCount > 0) {
        throw new HttpError(
          400,
          'La venta ya tiene devoluciones parciales. Selecciona solo los productos que faltan por devolver.'
        )
      }
    }

    // Se asocia al Dia_Operativo Abierto actual; si no hay ninguno, queda null
    // y se asocia al siguiente que se abra (mismo patrón que Gasto).
    const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })

    const devolucion = await tx.devolucion.create({
      data: {
        ventaId: venta.id,
        monto,
        motivo,
        medioPagoOriginal: venta.metodoPago,
        medioDevolucion,
        regresaAInventario: regresaAInventario === true,
        ventaProductoIds: idsProductos != null ? JSON.stringify(idsProductos) : null,
        cantidadesVentaProducto:
          cantidadesGuardar != null ? JSON.stringify(cantidadesGuardar) : null,
        diaOperativoId: dia?.id ?? null,
      },
    })

    // Si regresa_a_inventario = true, suma de vuelta el stock.
    let regresos = 0
    if (regresaAInventario === true) {
      if (idsProductos != null) {
        // Devolución PARCIAL por producto: regresan las Salida_venta EXACTAS
        // de los Venta_Producto indicados (modificadores, mitad y mitad, combos
        // y "usar disponible" ya aplicados en el momento de la venta), en la
        // fracción proporcional a la cantidad devuelta: si la línea fue de 20
        // unidades y se devuelven 10, cada movimiento regresa la mitad.
        const porId = new Map(
          (
            await tx.venta_Producto.findMany({
              where: { id: { in: idsProductos } },
              select: { id: true, cantidad: true },
            })
          ).map((v) => [v.id, v]),
        )
        const salidas = await tx.movimiento_Inventario.findMany({
          where: { ventaProductoId: { in: idsProductos }, tipoMovimiento: 'Salida_venta' },
        })
        for (const mv of salidas) {
          const vp = porId.get(mv.ventaProductoId)
          const factor =
            vp && vp.cantidad > 0 ? (cantidadesGuardar[mv.ventaProductoId] ?? vp.cantidad) / vp.cantidad : 1
          const cantidad = -mv.cantidad * factor
          if (!cantidad) continue
          await tx.movimiento_Inventario.create({
            data: {
              ...(mv.ingredienteId != null
                ? { ingredienteId: mv.ingredienteId }
                : { productoId: mv.productoId }),
              tipoMovimiento: 'Devolucion_regreso',
              cantidad,
              referenciaId: devolucion.id,
              referenciaTipo: 'Devolucion',
              ...(mv.ventaProductoId != null ? { ventaProductoId: mv.ventaProductoId } : {}),
            },
          })
          regresos++
          if (mv.ingredienteId != null) {
            await sincronizarStockIngrediente(tx, mv.ingredienteId)
          }
        }
      } else {
        // Devolución COMPLETA: regresa todo el stock que descontó la venta (se
        // recupera de los Movimiento_Inventario Salida_venta asociados, que ya
        // reflejan modificadores, mitad y mitad, y "usar disponible").
        const salidas = await tx.movimiento_Inventario.findMany({
          where: { referenciaId: venta.id, referenciaTipo: 'Venta', tipoMovimiento: 'Salida_venta' },
        })
        for (const mv of salidas) {
          await tx.movimiento_Inventario.create({
            data: {
              ...(mv.ingredienteId != null
                ? { ingredienteId: mv.ingredienteId }
                : { productoId: mv.productoId }),
              tipoMovimiento: 'Devolucion_regreso',
              cantidad: -mv.cantidad,
              referenciaId: devolucion.id,
              referenciaTipo: 'Devolucion',
              ...(mv.ventaProductoId != null ? { ventaProductoId: mv.ventaProductoId } : {}),
            },
          })
          regresos++
          if (mv.ingredienteId != null) {
            await sincronizarStockIngrediente(tx, mv.ingredienteId)
          }
        }
      }
    }

    return {
      devolucion: await tx.devolucion.findUnique({
        where: { id: devolucion.id },
        include: {
          venta: { include: { productos: { include: { producto: { select: { id: true, nombre: true } } } } } },
        },
      }),
      regresos,
      asociadaASiguienteDia: dia ? false : true,
    }
  }
}

export const crearDevolucion = asyncHandler(async (req, res) => {
  const resultado = await prisma.$transaction((tx) => crearDevolucionTx(tx, req.body))

  res.status(201).json({
    mensaje: 'Devolución registrada',
    devolucion: resultado.devolucion,
    movimientosRegreso: resultado.regresos,
    asociadaASiguienteDia: resultado.asociadaASiguienteDia,
  })
})

export const listarDevoluciones = asyncHandler(async (_req, res) => {
  const devoluciones = await prisma.devolucion.findMany({
    orderBy: { fechaHora: 'desc' },
    include: {
      venta: {
        include: {
          productos: {
            include: {
              producto: { select: { id: true, nombre: true } },
              combo: { select: { id: true, nombre: true } },
              mitadYMitad: true,
              modificadores: true,
            },
          },
        },
      },
      diaOperativo: { select: { id: true, estado: true } },
    },
  })

  // Reporte: producto, costo, medio de pago original, medio de devolución y la
  // CANTIDAD devuelta de cada línea (parcial por cantidad o completa).
  res.json(
    devoluciones.map((d) => {
      let idsSeleccionados = []
      try {
        idsSeleccionados = JSON.parse(d.ventaProductoIds || '[]').map(Number)
      } catch {}
      let cantidadesDevueltas = {}
      try {
        cantidadesDevueltas = JSON.parse(d.cantidadesVentaProducto || '{}')
      } catch {}
      const esParcial = d.ventaProductoIds != null
      return {
        id: d.id,
        fechaHora: d.fechaHora,
        monto: d.monto,
        motivo: d.motivo,
        medioPagoOriginal: d.medioPagoOriginal,
        medioDevolucion: d.medioDevolucion,
        regresaAInventario: d.regresaAInventario,
        ventaId: d.ventaId,
        diaOperativoId: d.diaOperativoId,
        cantidadesVentaProducto: d.cantidadesVentaProducto,
        // Solo las líneas realmente devueltas, con su cantidad devuelta
        // (para una devolución completa, todas las líneas por su cantidad).
        productos: d.venta.productos
          .filter((vp) => !esParcial || idsSeleccionados.includes(vp.id))
          .map((vp) => ({
            producto: vp.producto?.nombre ?? null,
            costo: vp.precioCongelado,
            cantidad: esParcial
              ? cantidadesDevueltas[vp.id] ?? vp.cantidad
              : vp.cantidad,
            comboId: vp.comboId,
            combo: vp.combo ? { id: vp.combo.id, nombre: vp.combo.nombre } : null,
            comboPrecioCongelado: vp.comboPrecioCongelado,
          })),
      }
    })
  )
})