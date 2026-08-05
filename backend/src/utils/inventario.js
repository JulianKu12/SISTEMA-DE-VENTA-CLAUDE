// Helpers de inventario (Módulo 04 — Punto de Venta e Inventario)
//
// El `stock_actual` de cada Ingrediente/Producto siempre se DERIVA de la suma
// de sus Movimiento_Inventario (docs/04 "stock_actual ... el resultado de sumar
// todos sus movimientos históricos"). Nunca se confía en un valor cacheado para
// tomar decisiones: se calcula desde los movimientos para evitar inconsistencias.

import { HttpError } from './httpError.js'

// Suma los movimientos de un ingrediente. Entradas son positivas y las
// Salidas_venta negativas, de modo que la suma es el stock actual.
export async function stockIngrediente(db, ingredienteId) {
  const agg = await db.movimiento_Inventario.aggregate({
    _sum: { cantidad: true },
    where: { ingredienteId },
  })
  return agg._sum.cantidad ?? 0
}

// Suma los movimientos de un producto (tipo Reventa_directa usa su propio
// movimiento por productoId, ver docs/03-modulo-productos.md).
export async function stockProducto(db, productoId) {
  const agg = await db.movimiento_Inventario.aggregate({
    _sum: { cantidad: true },
    where: { productoId },
  })
  return agg._sum.cantidad ?? 0
}

// Stock según el tipo de cuenta ('ingrediente' | 'producto').
export async function stockDe(db, tipo, id) {
  if (tipo === 'ingrediente') return stockIngrediente(db, id)
  if (tipo === 'producto') return stockProducto(db, id)
  throw new HttpError(400, 'tipo inválido')
}

// Re-sincroniza el campo cacheado `Ingrediente.stockActual` desde la suma de sus
// movimientos (mantener la caché al día). Los productos reventa no tienen campo
// de stock en el esquema, por eso solo aplica a ingredientes.
export async function sincronizarStockIngrediente(tx, ingredienteId) {
  const stock = await stockIngrediente(tx, ingredienteId)
  await tx.ingrediente.update({ where: { id: ingredienteId }, data: { stockActual: stock } })
  return stock
}

// Normaliza la bandera "usar lo disponible". Acepta:
//   true                                  -> confirmar TODO lo que falte
//   number[] / string[] 'ing:12'          -> id de ingrediente a confirmar
//   { tipo: 'ingrediente'|'producto', id} -> cuenta concreta
// Devuelve un Set[`tipo:id`].
export function normalizarUsarDisponible(usarDisponible) {
  const set = new Set()
  if (usarDisponible === true) return set

  if (Array.isArray(usarDisponible)) {
    for (const item of usarDisponible) {
      if (typeof item === 'number' || /^\d+$/.test(String(item))) {
        set.add(`ingrediente:${Number(item)}`)
      } else if (typeof item === 'object' && item?.tipo && item?.id) {
        set.add(`${item.tipo}:${Number(item.id)}`)
      } else if (typeof item === 'string') {
        set.add(item)
      }
    }
  }
  return set
}