import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'

const includeCompleto = {
  productos: {
    include: {
      producto: {
        include: {
          productoModificadores: { include: { modificador: true } },
        },
      },
    },
  },
}

async function validarItemsCombo(productos) {
  if (!Array.isArray(productos) || productos.length === 0) {
    throw new HttpError(400, 'Un combo requiere al menos un producto')
  }
  const items = []
  const vistos = new Set()
  for (const item of productos) {
    if (!item?.productoId) throw new HttpError(400, 'Cada producto del combo requiere productoId')
    const cantidad = item.cantidad ?? 1
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new HttpError(400, 'cantidad debe ser un entero mayor o igual a 1')
    }
    const id = Number(item.productoId)
    if (vistos.has(id)) throw new HttpError(400, `El producto ${id} está repetido en el combo`)
    vistos.add(id)
    const producto = await prisma.producto.findUnique({ where: { id } })
    if (!producto) throw new HttpError(404, `El producto ${id} no existe`)
    items.push({ productoId: producto.id, cantidad, disponibleHoy: producto.disponibleHoy })
  }
  return items
}

export const listar = asyncHandler(async (_req, res) => {
  const combos = await prisma.combo.findMany({ include: includeCompleto, orderBy: { nombre: 'asc' } })
  res.json(combos)
})

export const obtener = asyncHandler(async (req, res) => {
  const { id } = req.params
  const combo = await prisma.combo.findUnique({ where: { id: Number(id) }, include: includeCompleto })
  if (!combo) throw new HttpError(404, 'Combo no encontrado')
  res.json(combo)
})

export const crear = asyncHandler(async (req, res) => {
  const { nombre, precioEspecial, productos } = req.body
  if (!nombre || typeof nombre !== 'string') throw new HttpError(400, 'El campo nombre es obligatorio')
  if (typeof precioEspecial !== 'number') throw new HttpError(400, 'precioEspecial debe ser numérico')

  const items = await validarItemsCombo(productos)
  const conNoDisponibles = items.filter((i) => !i.disponibleHoy)

  const creado = await prisma.$transaction(async (tx) => {
    const combo = await tx.combo.create({
      data: { nombre, precioEspecial, estado: conNoDisponibles.length ? 'Suspendido' : 'Activo' },
    })
    await tx.combo_Producto.createMany({
      data: items.map((i) => ({ comboId: combo.id, productoId: i.productoId, cantidad: i.cantidad })),
    })
    return combo
  })

  const resultado = await prisma.combo.findUnique({ where: { id: creado.id }, include: includeCompleto })
  res.status(201).json({
    ...resultado,
    ...(conNoDisponibles.length
      ? {
          aviso: {
            mensaje: 'El combo se creó como Suspendido porque incluye productos no disponibles hoy.',
            productosNoDisponibles: conNoDisponibles.map((i) => i.productoId),
          },
        }
      : {}),
  })
})

export const actualizar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const combo = await prisma.combo.findUnique({ where: { id: Number(id) } })
  if (!combo) throw new HttpError(404, 'Combo no encontrado')

  const { nombre, precioEspecial, productos } = req.body
  const data = {}
  if (nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) throw new HttpError(400, 'nombre inválido')
    data.nombre = nombre
  }
  if (precioEspecial !== undefined) {
    if (typeof precioEspecial !== 'number') throw new HttpError(400, 'precioEspecial debe ser numérico')
    data.precioEspecial = precioEspecial
  }

  let items = null
  let conNoDisponibles = []
  if (productos !== undefined) {
    items = await validarItemsCombo(productos)
    conNoDisponibles = items.filter((i) => !i.disponibleHoy)
    if (conNoDisponibles.length) data.estado = 'Suspendido'
  }

  await prisma.$transaction(async (tx) => {
    await tx.combo.update({ where: { id: combo.id }, data })
    if (items) {
      await tx.combo_Producto.deleteMany({ where: { comboId: combo.id } })
      await tx.combo_Producto.createMany({
        data: items.map((i) => ({ comboId: combo.id, productoId: i.productoId, cantidad: i.cantidad })),
      })
    }
  })

  res.json({
    combo: await prisma.combo.findUnique({ where: { id: combo.id }, include: includeCompleto }),
    ...(conNoDisponibles.length
      ? {
          aviso: {
            mensaje: 'El combo quedó Suspendido porque incluye productos no disponibles hoy.',
            productosNoDisponibles: conNoDisponibles.map((i) => i.productoId),
          },
        }
      : {}),
  })
})

export const desactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const combo = await prisma.combo.findUnique({ where: { id: Number(id) } })
  if (!combo) throw new HttpError(404, 'Combo no encontrado')
  if (combo.estado === 'Inactivo') throw new HttpError(400, 'El combo ya está inactivo')
  const actualizado = await prisma.combo.update({ where: { id: combo.id }, data: { estado: 'Inactivo' } })
  res.json(actualizado)
})

export const reactivar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const combo = await prisma.combo.findUnique({ where: { id: Number(id) }, include: includeCompleto })
  if (!combo) throw new HttpError(404, 'Combo no encontrado')
  if (combo.estado === 'Activo') throw new HttpError(400, 'El combo ya está activo')

  if (combo.estado === 'Suspendido') {
    const tieneProductosNoDisponibles = combo.productos.some((cp) => !cp.producto.disponibleHoy)
    if (tieneProductosNoDisponibles) {
      throw new HttpError(
        409,
        'No se puede reactivar: el combo está suspendido porque alguno de sus productos no está disponible hoy. Reactiva primero los productos.'
      )
    }
  }

  const actualizado = await prisma.combo.update({
    where: { id: combo.id },
    data: { estado: 'Activo' },
  })
  res.json({ mensaje: 'Combo reactivado', combo: actualizado })
})

export const eliminar = asyncHandler(async (req, res) => {
  const { id } = req.params
  const combo = await prisma.combo.findUnique({ where: { id: Number(id) } })
  if (!combo) throw new HttpError(404, 'Combo no encontrado')

  const vendido = await prisma.venta_Producto.count({ where: { comboId: combo.id } })
  if (vendido > 0) {
    throw new HttpError(
      409,
      `No se puede eliminar: el combo ya ha sido vendido (${vendido} venta(s)). Desactívalo en su lugar.`
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.combo_Producto.deleteMany({ where: { comboId: combo.id } })
    await tx.combo.delete({ where: { id: combo.id } })
  })
  res.status(204).end()
})