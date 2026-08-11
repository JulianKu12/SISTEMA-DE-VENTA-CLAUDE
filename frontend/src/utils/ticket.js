const idsModificadoresDe = (item) =>
  (item.modificadores || []).map((m) => m.id ?? m.modificadorId).sort((a, b) => a - b)

const productosIguales = (a, b) => {
  if (a.productoId !== b.productoId) return false
  if ((a.nota || '') !== (b.nota || '')) return false
  const modsA = idsModificadoresDe(a)
  const modsB = idsModificadoresDe(b)
  if (modsA.length !== modsB.length) return false
  for (let i = 0; i < modsA.length; i += 1) {
    if (modsA[i] !== modsB[i]) return false
  }
  return true
}

export function esMismaConfiguracion(a, b) {
  if (a.tipoLinea !== b.tipoLinea) return false
  if (a.tipoLinea === 'combo') {
    if (a.comboId !== b.comboId || a.nota !== b.nota) return false
    const prodsA = a.productos || []
    const prodsB = b.productos || []
    if (prodsA.length !== prodsB.length) return false
    for (let i = 0; i < prodsA.length; i += 1) {
      if (!productosIguales(prodsA[i], prodsB[i])) return false
    }
    return true
  }
  if (a.productoId !== b.productoId) return false
  if (a.esMitadYMitad !== b.esMitadYMitad) return false
  if (a.esMitadYMitad && (a.sabor1?.id !== b.sabor1?.id || a.sabor2?.id !== b.sabor2?.id)) {
    return false
  }
  const modsA = idsModificadoresDe(a)
  const modsB = idsModificadoresDe(b)
  if (modsA.length !== modsB.length) return false
  for (let i = 0; i < modsA.length; i += 1) {
    if (modsA[i] !== modsB[i]) return false
  }
  return a.nota === b.nota
}

export function agregarLinea(setTicket, linea) {
  setTicket((t) => {
    const coincidencia = t.findIndex((item) => esMismaConfiguracion(item, linea))
    if (coincidencia >= 0) {
      const copia = t.slice()
      copia[coincidencia] = {
        ...copia[coincidencia],
        cantidad: copia[coincidencia].cantidad + (linea.cantidad || 1),
      }
      return copia
    }
    return [...t, linea]
  })
}
