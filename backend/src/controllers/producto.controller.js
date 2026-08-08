import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { TIPOS_PRODUCTO, esEnumValido } from '../utils/enums.js'

const includeCompleto = {
  productoIngredientes: { include: { ingrediente: true } },
  productoModificadores: { include: { modificador: true } },
  combosProductos: { include: { combo: { select: { id: true, nombre: true, estado: true } } } },
}

async function validarReceta(ingredientes) {
  if (!Array.isArray(ingredientes) || ingredientes.length === 0) {
    throw new HttpError(400, 'Un producto con receta requiere al menos un ingrediente')
  }
  const receta = []
  const vistos = new Set()
  for (const item of ingredientes) {
    if (!item?.ingredienteId || typeof item.cantidad !== 'number') {
      throw new HttpError(400, 'Cada ingrediente de la receta requiere ingredienteId y cantidad numérica')
    }
    const id = Number(item.ingredienteId)
    if (vistos.has(id)) throw new HttpError(400, `El ingrediente ${id} está repetido en la receta`)
    vistos.add(id)
    const ingrediente = await prisma.ingrediente.findUnique({ where: { id } })
    if (!ingrediente) throw new HttpError(404, `El ingrediente ${id} no existe`)
    receta.push({ ingredienteId: ingrediente.id, cantidad: item.cantidad })
  }
  return receta
}

export const listar = asyncHandler(async (req, res) => {
  const { estado, disponibleHoy } = req.query
  const where = {}
  if (estado === 'Activo' || estado === 'Inactivo') where.estado = estado
  if (disponibleHoy === 'true' || disponibleHoy === 'false') where.disponibleHoy = disponibleHoy === 'true'

  const productos = await prisma.producto.findMany({
    where,
    include: includeCompleto,
    orderBy: { nombre: 'asc' },
  })
  res.json(productos)
})

export const obtener = asyncHandler(async (req, res) => {
  const { id } = req.params
  const producto = await prisma.producto.findUnique({
    where: { id: Number(id) },
    include: {
      ...includeCompleto,
      movimientosInventario: { orderBy: { fechaHora: 'desc' }, take: 20 },
    },
  })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')
  res.json(producto)
})

export const crear = asyncHandler(async (req, res) => {
  const { nombre, precio, tipo, permiteMitadYMitad, disponibleHoy, ingredientes, stockInicial, costo } = req.body
  if (!nombre || typeof nombre !== 'string') throw new HttpError(400, 'El campo nombre es obligatorio')
  if (typeof precio !== 'number') throw new HttpError(400, 'El campo precio debe ser numérico')
  if (!esEnumValido(tipo, TIPOS_PRODUCTO)) throw new HttpError(400, 'tipo inválido')

  let receta = null
  if (tipo === 'Con_receta') {
    if (stockInicial != null || costo != null) {
      throw new HttpError(400, 'stockInicial y costo solo aplican a productos de reventa directa')
    }
    receta = await validarReceta(ingredientes)
  } else if (tipo === 'Reventa_directa') {
    if (Array.isArray(ingredientes) && ingredientes.length > 0) {
      throw new HttpError(400, 'Un producto de reventa directa no lleva receta: es su propio ingrediente')
    }
    if (permiteMitadYMitad === true) {
      throw new HttpError(400, 'permiteMitadYMitad solo aplica a productos con receta')
    }
    if (stockInicial != null && (typeof stockInicial !== 'number' || stockInicial <= 0)) {
      throw new HttpError(400, 'stockInicial debe ser un número mayor a 0')
    }
    if (costo != null) {
      if (typeof costo !== 'number' || costo < 0) {
        throw new HttpError(400, 'costo debe ser un número mayor o igual a 0')
      }
      if (stockInicial == null) {
        throw new HttpError(400, 'El costo requiere un stockInicial del producto')
      }
    }
  }

  const usuarioId = resolverUsuario(req)
  const creado = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.producto.create({
      data: {
        nombre,
        precio,
        tipo,
        permiteMitadYMitad: tipo === 'Con_receta' ? (permiteMitadYMitad ?? false) : false,
        disponibleHoy: disponibleHoy ?? true,
      },
    })
    if (receta) {
      await tx.producto_Ingrediente.createMany({
        data: receta.map((r) => ({ productoId: nuevo.id, ingredienteId: r.ingredienteId, cantidad: r.cantidad })),
      })
    }
    // Reventa directa con stock inicial: la Entrada de inventario se genera
    // automáticamente al crear el producto (igual que con los Ingredientes) y,
    // si se capturó el costo, también el Gasto de esa compra.
    if (tipo === 'Reventa_directa' && stockInicial != null) {
      await tx.movimiento_Inventario.create({
        data: { productoId: nuevo.id, tipoMovimiento: 'Entrada', cantidad: stockInicial },
      })
      if (costo != null) {
        const dia = await tx.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })
        await tx.gasto.create({
          data: {
            concepto: `Entrada de inventario: ${nuevo.nombre}`,
            monto: costo,
            categoria: 'Insumos',
            metodoPago: 'Efectivo',
            origen: 'Automatico_por_entrada_inventario',
            diaOperativoId: dia?.id ?? null,
            usuarioId,
          },
        })
      }
    }
    return nuevo
  })

  res.status(201).json(await prisma.producto.findUnique({ where: { id: creado.id }, include: includeCompleto }))
})

export const actualizar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const producto = await prisma.producto.findUnique({ where: { id: Number(id) } })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')

  const { nombre, precio, permiteMitadYMitad, ingredientes } = req.body
  const data = {}
  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) throw new HttpError(400, 'nombre inválido')
    data.nombre = nombre
  }
  if (precio !== undefined) {
    if (typeof precio !== 'number') throw new HttpError(400, 'precio debe ser numérico')
    data.precio = precio
  }
  if (permiteMitadYMitad !== undefined) {
    if (producto.tipo === 'Reventa_directa' && permiteMitadYMitad === true) {
      throw new HttpError(400, 'permiteMitadYMitad solo aplica a productos con receta')
    }
    data.permiteMitadYMitad = Boolean(permiteMitadYMitad)
  }

  let receta = null
  if (ingredientes !== undefined) {
    if (producto.tipo === 'Reventa_directa') {
      throw new HttpError(400, 'Un producto de reventa directa no lleva receta')
    }
    receta = await validarReceta(ingredientes)
  }

  const actualizado = await prisma.$transaction(async (tx) => {
    const upd = await tx.producto.update({ where: { id: producto.id }, data })
    if (receta) {
      await tx.producto_Ingrediente.deleteMany({ where: { productoId: producto.id } })
      await tx.producto_Ingrediente.createMany({
        data: receta.map((r) => ({ productoId: producto.id, ingredienteId: r.ingredienteId, cantidad: r.cantidad })),
      })
    }
    return upd
  })

  let aviso = null
  if (precio !== undefined && precio !== producto.precio) {
    const combos = await prisma.combo_Producto.findMany({
      where: { productoId: producto.id, combo: { estado: 'Activo' } },
      include: { combo: { select: { id: true, nombre: true } } },
    })
    if (combos.length) {
      aviso = {
        mensaje: 'El precio de este producto cambió y participa en combos activos. Revisa su precio especial.',
        combos: combos.map((c) => c.combo),
      }
    }
  }

  res.json({
    producto: await prisma.producto.findUnique({ where: { id: producto.id }, include: includeCompleto }),
    ...(aviso ? { aviso } : {}),
  })
})

export const actualizarDisponibilidad = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { disponibleHoy } = req.body
  if (typeof disponibleHoy !== 'boolean') throw new HttpError(400, 'disponibleHoy debe ser booleano')

  const producto = await prisma.producto.findUnique({ where: { id: Number(id) } })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')

  const actualizado = await prisma.producto.update({ where: { id: producto.id }, data: { disponibleHoy } })

  let aviso = null
  if (!disponibleHoy) {
    const combos = await prisma.combo_Producto.findMany({
      where: { productoId: producto.id, combo: { estado: 'Activo' } },
      include: { combo: { select: { id: true, nombre: true } } },
    })
    const combosActivos = combos.map((c) => c.combo)
    if (combosActivos.length) {
      await prisma.combo.updateMany({
        where: { id: { in: combosActivos.map((c) => c.id) } },
        data: { estado: 'Suspendido' },
      })
      aviso = {
        mensaje: 'El producto se marcó como no disponible hoy. Se suspendieron los combos activos que lo incluyen.',
        combosSuspendidos: combosActivos,
      }
    }
  }

  res.json({ producto: actualizado, ...(aviso ? { aviso } : {}) })
})

export const desactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const producto = await prisma.producto.findUnique({ where: { id: Number(id) } })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')
  if (producto.estado === 'Inactivo') throw new HttpError(400, 'El producto ya está inactivo')

  const resultado = await prisma.$transaction(async (tx) => {
    const upd = await tx.producto.update({ where: { id: producto.id }, data: { estado: 'Inactivo' } })
    const combos = await tx.combo_Producto.findMany({
      where: { productoId: producto.id, combo: { estado: 'Activo' } },
      select: { combo: { select: { id: true, nombre: true } } },
    })
    const combosActivos = [...new Map(combos.map((c) => [c.combo.id, c.combo])).values()]
    if (combosActivos.length) {
      await tx.combo.updateMany({
        where: { id: { in: combosActivos.map((c) => c.id) } },
        data: { estado: 'Suspendido' },
      })
    }
    return { upd, combosActivos }
  })

  res.json({
    mensaje: 'Producto desactivado',
    producto: resultado.upd,
    aviso: resultado.combosActivos.length
      ? {
          mensaje: 'Este producto participa en combos activos. Se suspendieron automáticamente.',
          combosSuspendidos: resultado.combosActivos,
        }
      : null,
  })
})

export const reactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const producto = await prisma.producto.findUnique({ where: { id: Number(id) } })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')
  if (producto.estado === 'Activo') throw new HttpError(400, 'El producto ya está activo')

  const actualizado = await prisma.producto.update({
    where: { id: producto.id },
    data: { estado: 'Activo' },
  })
  res.json({ mensaje: 'Producto reactivado', producto: actualizado })
})

export const eliminar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const producto = await prisma.producto.findUnique({ where: { id: Number(id) } })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')

  const vendido = await prisma.venta_Producto.count({ where: { productoId: producto.id } })
  const enMitades = await prisma.venta_Producto_Mitad.count({
    where: { OR: [{ sabor1ProductoId: producto.id }, { sabor2ProductoId: producto.id }] },
  })
  const movimientos = await prisma.movimiento_Inventario.count({ where: { productoId: producto.id } })
  const combos = await prisma.combo_Producto.count({ where: { productoId: producto.id } })

  if (vendido > 0 || enMitades > 0 || movimientos > 0 || combos > 0) {
    throw new HttpError(
      409,
      `No se puede eliminar el producto. Registros asociados — ventas: ${vendido}, mitades: ${enMitades}, movimientos de inventario: ${movimientos}, combos: ${combos}. Desactívalo en su lugar.`
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.producto_Ingrediente.deleteMany({ where: { productoId: producto.id } })
    await tx.producto_Modificador.deleteMany({ where: { productoId: producto.id } })
    await tx.producto.delete({ where: { id: producto.id } })
  })
  res.status(204).end()
})

export const asociarModificador = asyncHandler(async (req, res) => {
  const { productoId } = req.params
  const { modificadorId } = req.body
  if (!modificadorId) throw new HttpError(400, 'modificadorId es obligatorio')

  const producto = await prisma.producto.findUnique({ where: { id: Number(productoId) } })
  if (!producto) throw new HttpError(404, 'Producto no encontrado')
  const modificador = await prisma.modificador.findUnique({ where: { id: Number(modificadorId) } })
  if (!modificador) throw new HttpError(404, 'Modificador no encontrado')

  try {
    const relacion = await prisma.producto_Modificador.create({
      data: { productoId: producto.id, modificadorId: modificador.id },
    })
    res.status(201).json(relacion)
  } catch (e) {
    if (e.code === 'P2002') throw new HttpError(409, 'El producto ya tiene asociado este modificador')
    throw e
  }
})

export const desasociarModificador = asyncHandler(async (req, res) => {
  const { productoId, modificadorId } = req.params
  const relacion = await prisma.producto_Modificador.findFirst({
    where: { productoId: Number(productoId), modificadorId: Number(modificadorId) },
  })
  if (!relacion) throw new HttpError(404, 'La relación producto-modificador no existe')
  await prisma.producto_Modificador.delete({ where: { id: relacion.id } })
  res.status(204).end()
})