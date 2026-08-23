// Medición temporal de VOLUMEN contra sec_vol.db (2 años, 73k ventas).
// Parte 1: tiempos de las consultas reales del negocio.
// Parte 2: carga simulada 175 s (mismo mix que la prueba ligera) + conteo.
const BASE = 'http://localhost:3001'

async function req(method, path, body, token) {
  const t = performance.now()
  const r = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  const ms = performance.now() - t
  return { ms, status: r.status, bytes: text.length, body: text }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const login = await req('POST', '/api/auth/login', { usuario: 'admin', contraseña: 'admin123' })
  if (login.status !== 200) { console.log('LOGIN_FAIL', login.status, login.body.slice(0, 200)); process.exit(1) }
  const token = JSON.parse(login.body).token
  console.log('LOGIN_OK')

  // ---- Parte 1: consultas específicas ----
  const consultas = [
    ['PANEL_PEDIDOS_DIA', 'GET', '/api/pedidos', null],
    ['REPORTE_MES', 'GET', '/api/ventas?fechaDesde=2026-07-19&fechaHasta=2026-08-18', null],
    ['REPORTE_HISTORIAL', 'GET', '/api/ventas', null],
    ['VENTA_NUEVA', 'POST', '/api/ventas', { productos: [{ productoId: 1, cantidad: 2, modificadores: [{ modificadorId: 3 }] }], metodoPago: 'Efectivo' }],
  ]
  for (const [nombre, method, path, body] of consultas) {
    const r = await req(method, path, body, token)
    console.log(`TIMING_${nombre}: ${r.ms.toFixed(1)} ms status=${r.status} bytes=${r.bytes}`)
  }

  // ---- Parte 2: carga 175 s (mix ligero comparable + panel ocasional) ----
  const tIni = Date.now()
  const fin = tIni + 175000
  let ok = 0, fail = 0, writes = 0, reads = 0
  const tms = []
  const pedidoBody = () => ({ tipo: 'Para_recoger', origen: 'Mostrador', productos: [{ productoId: pick([1, 3, 5]), cantidad: 1 }], metodoPago: 'Efectivo', estadoPago: 'Pagado' })
  const ventaBody = () => ({ productos: [{ productoId: pick([1, 3, 5]), cantidad: 1 }], metodoPago: pick(['Efectivo', 'Tarjeta', 'Transferencia']) })

  while (Date.now() < fin) {
    const r = rnd()
    let peticion
    if (r < 0.225) { peticion = req('POST', '/api/ventas', ventaBody(), token); writes++ }
    else if (r < 0.45) { peticion = req('POST', '/api/pedidos', pedidoBody(), token); writes++ }
    else if (r < 0.55) { peticion = req('GET', '/api/pedidos', null, token); reads++ }
    else if (r < 0.7) { peticion = req('GET', '/api/ventas?fechaDesde=2026-07-19&fechaHasta=2026-08-18', null, token); reads++ }
    else if (r < 0.85) { peticion = req('GET', '/api/productos', null, token); reads++ }
    else { peticion = req('GET', '/api/gastos', null, token); reads++ }
    const res = await peticion
    tms.push(res.ms)
    if (res.status >= 200 && res.status < 300) ok++
    else { fail++; if (fail <= 5) console.log(`LOAD_FAIL ${res.status} ${res.body.slice(0, 150)}`) }
    await sleep(Math.max(0, 700 - res.ms))
  }
  tms.sort((a, b) => a - b)
  const p50 = tms[Math.floor(tms.length * 0.5)]
  const p95 = tms[Math.floor(tms.length * 0.95)]
  const max = tms[tms.length - 1]
  const totalS = (Date.now() - tIni) / 1000
  console.log(`LOAD_OK: ${ok} LOAD_FAIL: ${fail} LOAD_WRITES: ${writes} LOAD_READS: ${reads}`)
  console.log(`LOAD_REQMIN: ${(ok / totalS * 60).toFixed(1)} LOAD_MS_P50: ${p50.toFixed(0)} LOAD_MS_P95: ${p95.toFixed(0)} LOAD_MS_MAX: ${max.toFixed(0)}`)
  console.log('MEDICION_DONE')
}

const rnd = () => Math.random()
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

main().catch((e) => { console.error('ERROR', e); process.exit(1) })