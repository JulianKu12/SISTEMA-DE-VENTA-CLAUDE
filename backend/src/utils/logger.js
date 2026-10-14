function escribir(nivel, evento, campos = {}) {
  const registro = {
    timestamp: new Date().toISOString(),
    level: nivel,
    event: evento,
    ...campos,
  }
  const linea = JSON.stringify(registro)
  if (nivel === 'error') {
    console.error(linea)
  } else {
    console.log(linea)
  }
}

export function logInfo(evento, campos) {
  escribir('info', evento, campos)
}

export function logWarn(evento, campos) {
  escribir('warn', evento, campos)
}

export function logError(evento, campos) {
  escribir('error', evento, campos)
}
