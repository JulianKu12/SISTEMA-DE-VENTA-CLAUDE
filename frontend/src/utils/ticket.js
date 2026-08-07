const idsModificadoresDe = (item) =>
  (item.modificadores || []).map((m) => m.id ?? m.modificadorId).sort((a, b) => a - b)

export function esMismaConfiguracion(a, b) {
  if (a.tipoLinea !== b.tipoLinea) return false
  if (a.tipoLinea === 'combo') {
    return a.comboId === b.comboId && a.nota === b.nota
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
