// Runner de REGRESIÓN COMPLETA: ejecuta las 5 suites en UNA sola corrida
// (mismo servidor, sin reinicios) y agrega el resultado. Requiere el servidor
// levantado contra la BD de prueba:
//   $env:DATABASE_URL='file:./sec_test.db'; node src/index.js
// Uso:
//   node _test_regresion.mjs
import { spawn } from 'node:child_process'

const suites = [
  '_test_modulo3.mjs',
  '_test_modulo4.mjs',
  '_test_modulo5.mjs',
  '_test_modulo6.mjs',
  '_test_modulo7.mjs',
]

let totalFallas = 0
let totalOk = 0

console.log('== REGRESIÓN COMPLETA: 5 suites en una sola corrida ==\n')
for (const s of suites) {
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [s], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      process.stdout.write(d)
    })
    child.on('error', (e) => {
      console.error(`No se pudo ejecutar ${s}:`, e.message)
      totalFallas++
      resolve()
    })
    child.on('exit', (code) => {
      const fallas = (out.match(/FALLA /g) || []).length
      const oks = (out.match(/  OK  /g) || []).length
      const crasheo = code !== 0 || oks === 0
      if (crasheo) {
        totalFallas++
        console.error(`\n>>> ${s}: CRASH o 0 pruebas ejecutadas (exit ${code})`)
      } else {
        totalFallas += fallas
        totalOk += oks
        console.log(`\n>>> ${s}: ${oks} OK, ${fallas} FALLA(S)`)
      }
      resolve()
    })
  })
}

console.log(
  `\nREGRESIÓN COMPLETA: ${totalOk} pruebas OK, ${totalFallas} FALLA(S) ` +
    `en las 5 suites -> ${totalFallas === 0 ? 'TODAS PASARON' : 'REGRESIÓN FALLIDA'}`
)
process.exit(totalFallas === 0 ? 0 : 1)