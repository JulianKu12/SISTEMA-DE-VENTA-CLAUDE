// Seed de DATOS DE PRUEBA (Módulos 03–07) para hacer pruebas manuales completas.
// Diferente a prisma/seed.js (que solo crea el Usuario Administrador).
//
// Ejecutar:
//   cd backend
//   npm run db:seed:pruebas        (equivalente a: node prisma/seed-pruebas.js)
//
// Es SEGURO correrlo sobre una base que ya tenga datos: cada elemento se crea
// solo si no existe ya (idempotente), y todo corre dentro de una transacción.
//
// NO abre caja automáticamente: eso se hace a mano en la UI (Módulo 05).
import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ---------------------------------------------------------------------------
// Definiciones de los datos de prueba
// ---------------------------------------------------------------------------

const INGREDIENTES = [
  { nombre: 'Pan', unidadMedida: 'pieza', stock: 40, stockMinimoAlerta: 5, costo: 3 },
  { nombre: 'Jamón', unidadMedida: 'pieza', stock: 40, stockMinimoAlerta: 5, costo: 2 },
  { nombre: 'Queso', unidadMedida: 'pieza', stock: 40, stockMinimoAlerta: 5, costo: 2.5 },
  // "porción" no existe en el enum UnidadMedida (kg/g/l/ml/pieza); se usa "pieza".
  { nombre: 'Lechuga', unidadMedida: 'pieza', stock: 30, stockMinimoAlerta: 5, costo: 1 },
  { nombre: 'Refresco cola', unidadMedida: 'pieza', stock: 24, stockMinimoAlerta: 5, costo: 8 },
]

const PRODUCTOS = [
  {
    nombre: 'Torta de jamón',
    precio: 45,
    tipo: 'Con_receta',
    permiteMitadYMitad: false,
    receta: [
      { ingrediente: 'Pan', cantidad: 1 },
      { ingrediente: 'Jamón', cantidad: 2 },
      { ingrediente: 'Queso', cantidad: 1 },
    ],
  },
  {
    nombre: 'Torta mixta',
    precio: 50,
    tipo: 'Con_receta',
    permiteMitadYMitad: true,
    receta: [
      { ingrediente: 'Pan', cantidad: 1 },
      { ingrediente: 'Jamón', cantidad: 1 },
      { ingrediente: 'Queso', cantidad: 1 },
      { ingrediente: 'Lechuga', cantidad: 1 },
    ],
  },
  {
    nombre: 'Torta de queso',
    precio: 40,
    tipo: 'Con_receta',
    permiteMitadYMitad: true,
    receta: [
      { ingrediente: 'Pan', cantidad: 1 },
      { ingrediente: 'Queso', cantidad: 2 },
    ],
  },
  { nombre: 'Refresco', precio: 20, tipo: 'Reventa_directa', stockInicial: 24 },
]

const MODIFICADORES = [
  { nombre: 'Sin lechuga', tipo: 'Quitar', ingredienteAfectado: 'Lechuga' },
  {
    nombre: 'Extra jamón',
    tipo: 'Agregar',
    ingredienteAfectado: 'Jamón',
    cantidadExtra: 1,
    costoAdicional: 10,
  },
]

const COMBO = {
  nombre: 'Combo torta + refresco',
  precioEspecial: 60,
  productos: [
    { producto: 'Torta de jamón', cantidad: 1 },
    { producto: 'Refresco', cantidad: 1 },
  ],
}

const CLIENTE = {
  nombre: 'María López',
  telefono: '555-1234-5678',
  referencias: [
    'Casa azul, frente a la tienda de don Beto',
    'Changarro cerca de la cancha',
  ],
}

const REPARTIDOR = {
  nombre: 'Carlos Ramírez',
  usuario: 'carlos',
  contraseña: 'carlos123',
  estadoDisponibilidad: 'Disponible',
}

const CONFIGURACION = {
  costoEnvio: 15,
  opcionesCambio: [50, 100, 200, 500],
  repartidorUnico: false,
}

// ---------------------------------------------------------------------------
// Ayudantes de idempotencia y registro
// ---------------------------------------------------------------------------

const creados = []
const yaExistian = []

function registrar(accion, entidad, id) {
  if (accion === 'creado') creados.push(`${entidad} #${id}`)
  else yaExistian.push(`${entidad} #${id}`)
}

async function ingredientePorNombre(tx, nombre) {
  return tx.ingrediente.findFirst({ where: { nombre } })
}

async function productoPorNombre(tx, nombre) {
  return tx.producto.findFirst({ where: { nombre } })
}

// ---------------------------------------------------------------------------
// Transacción principal
// ---------------------------------------------------------------------------

async function main() {
  const resumen = await prisma.$transaction(async (tx) => {
    // ---- 1. Ingredientes (con movimiento Entrada para que el stock derivado
    // ----    coincida con la suma de Movimiento_Inventario, docs/04).
    const idsIngredientes = {}
    for (const ing of INGREDIENTES) {
      const existente = await ingredientePorNombre(tx, ing.nombre)
      if (existente) {
        registrar('existia', 'Ingrediente', existente.id)
        idsIngredientes[ing.nombre] = existente.id
        continue
      }
      const creado = await tx.ingrediente.create({
        data: {
          nombre: ing.nombre,
          unidadMedida: ing.unidadMedida,
          stockActual: ing.stock,
          stockMinimoAlerta: ing.stockMinimoAlerta,
          costoUltimaCompra: ing.costo,
          estado: 'Activo',
        },
      })
      await tx.movimiento_Inventario.create({
        data: {
          ingredienteId: creado.id,
          tipoMovimiento: 'Entrada',
          cantidad: ing.stock,
          motivo: 'Conteo_fisico',
        },
      })
      registrar('creado', 'Ingrediente', creado.id)
      idsIngredientes[ing.nombre] = creado.id
    }

    // ---- 2. Productos.
    const idsProductos = {}
    for (const prod of PRODUCTOS) {
      const existente = await productoPorNombre(tx, prod.nombre)
      if (existente) {
        registrar('existia', 'Producto', existente.id)
        idsProductos[prod.nombre] = existente.id
        continue
      }
      const creado = await tx.producto.create({
        data: {
          nombre: prod.nombre,
          precio: prod.precio,
          tipo: prod.tipo,
          permiteMitadYMitad: prod.permiteMitadYMitad ?? false,
          disponibleHoy: true,
          estado: 'Activo',
        },
      })
      if (prod.tipo === 'Con_receta') {
        for (const r of prod.receta) {
          await tx.producto_Ingrediente.create({
            data: {
              productoId: creado.id,
              ingredienteId: idsIngredientes[r.ingrediente],
              cantidad: r.cantidad,
            },
          })
        }
      } else {
        // Reventa_directa: su stock propio se deriva de los movimientos con
        // productoId (mismo criterio que el Módulo 03 al dar de alta el producto).
        await tx.movimiento_Inventario.create({
          data: {
            productoId: creado.id,
            tipoMovimiento: 'Entrada',
            cantidad: prod.stockInicial,
            motivo: 'Conteo_fisico',
          },
        })
      }
      registrar('creado', 'Producto', creado.id)
      idsProductos[prod.nombre] = creado.id
    }

    // ---- 3. Modificadores y su asociación a productos.
    const idsModificadores = {}
    for (const mod of MODIFICADORES) {
      const existente = await tx.modificador.findFirst({ where: { nombre: mod.nombre } })
      if (existente) {
        registrar('existia', 'Modificador', existente.id)
        idsModificadores[mod.nombre] = existente.id
        continue
      }
      const creado = await tx.modificador.create({
        data: {
          nombre: mod.nombre,
          tipo: mod.tipo,
          ingredienteAfectadoId: idsIngredientes[mod.ingredienteAfectado],
          cantidadExtra: mod.cantidadExtra ?? null,
          costoAdicional: mod.costoAdicional ?? 0,
          estado: 'Activo',
        },
      })
      registrar('creado', 'Modificador', creado.id)
      idsModificadores[mod.nombre] = creado.id
    }
    // Asociar "Sin lechuga" y "Extra jamón" a "Torta mixta".
    const tortaMixta = idsProductos['Torta mixta']
    if (tortaMixta) {
      const productoMods = await tx.producto_Modificador.findMany({
        where: { productoId: tortaMixta },
      })
      const asociados = new Set(productoMods.map((pm) => pm.modificadorId))
      for (const mod of MODIFICADORES) {
        const modId = idsModificadores[mod.nombre]
        if (!modId || asociados.has(modId)) continue
        await tx.producto_Modificador.create({ data: { productoId: tortaMixta, modificadorId: modId } })
        console.log(`  asociado: Modificador "${mod.nombre}" -> Torta mixta (producto #${tortaMixta})`)
      }
    }

    // ---- 4. Combo.
    const comboExistente = await tx.combo.findFirst({ where: { nombre: COMBO.nombre } })
    if (comboExistente) {
      registrar('existia', 'Combo', comboExistente.id)
    } else {
      const combo = await tx.combo.create({
        data: { nombre: COMBO.nombre, precioEspecial: COMBO.precioEspecial, estado: 'Activo' },
      })
      for (const cp of COMBO.productos) {
        await tx.combo_Producto.create({
          data: { comboId: combo.id, productoId: idsProductos[cp.producto], cantidad: cp.cantidad },
        })
      }
      registrar('creado', 'Combo', combo.id)
    }

    // ---- 5. Cliente con referencias.
    const clienteExistente = await tx.cliente.findFirst({
      where: { nombre: CLIENTE.nombre, telefono: CLIENTE.telefono },
    })
    if (clienteExistente) {
      registrar('existia', 'Cliente', clienteExistente.id)
    } else {
      const cliente = await tx.cliente.create({
        data: { nombre: CLIENTE.nombre, telefono: CLIENTE.telefono, estado: 'Activo' },
      })
      for (const descripcion of CLIENTE.referencias) {
        await tx.cliente_Referencia.create({
          data: { clienteId: cliente.id, descripcion, estado: 'Activo' },
        })
      }
      registrar('creado', 'Cliente', cliente.id)
    }

    // ---- 6. Repartidor: Usuario (tipo Repartidor) + Empleado ligado (docs/06).
    const cuentaRepartidor = await tx.usuario.findUnique({ where: { usuario: REPARTIDOR.usuario } })
    const empleadoRepartidor = await tx.empleado.findFirst({
      where: { nombre: REPARTIDOR.nombre },
    })
    if (empleadoRepartidor) {
      registrar('existia', 'Repartidor (empleado)', empleadoRepartidor.id)
    } else {
      const cuenta =
        cuentaRepartidor ??
        (await tx.usuario.create({
          data: {
            tipo: 'Repartidor',
            nombre: REPARTIDOR.nombre,
            usuario: REPARTIDOR.usuario,
            contraseña: await bcrypt.hash(REPARTIDOR.contraseña, 10),
          },
        }))
      const empleado = await tx.empleado.create({
        data: {
          nombre: REPARTIDOR.nombre,
          estadoDisponibilidad: REPARTIDOR.estadoDisponibilidad,
          usuarioId: cuenta.id,
        },
      })
      registrar('creado', 'Repartidor (empleado)', empleado.id)
      registrar('creado', 'Usuario repartidor', cuenta.id)
    }

    // ---- 7. Configuración (registro único id=1).
    const config = await tx.configuracion.upsert({
      where: { id: 1 },
      update: {
        costoEnvio: CONFIGURACION.costoEnvio,
        repartidorUnico: CONFIGURACION.repartidorUnico,
        opcionesCambio: CONFIGURACION.opcionesCambio,
      },
      create: {
        id: 1,
        costoEnvio: CONFIGURACION.costoEnvio,
        repartidorUnico: CONFIGURACION.repartidorUnico,
        opcionesCambio: CONFIGURACION.opcionesCambio,
      },
    })
    console.log(`  Configuración (id=${config.id}): costoEnvio=${config.costoEnvio}, repartidorUnico=${config.repartidorUnico}, opcionesCambio=[${config.opcionesCambio.join(', ')}]`)

    // ---- Resumen para ubicar fácilmente cada cosa en la UI.
    return {
      idsIngredientes,
      idsProductos,
      idsModificadores,
      combo: comboExistente?.id ?? (await tx.combo.findFirst({ where: { nombre: COMBO.nombre } })).id,
      cliente: clienteExistente?.id ?? (await tx.cliente.findFirst({ where: { nombre: CLIENTE.nombre, telefono: CLIENTE.telefono } })).id,
      repartidor: empleadoRepartidor?.id ?? (await tx.empleado.findFirst({ where: { nombre: REPARTIDOR.nombre } })).id,
    }
  })

  console.log('\n========================================')
  console.log('  RESUMEN DE DATOS DE PRUEBA')
  console.log('========================================')
  console.log('\nIDs para ubicar en la UI:')
  for (const [nombre, id] of Object.entries(resumen.idsIngredientes)) console.log(`  Ingrediente  "${nombre}"           -> id ${id}`)
  for (const [nombre, id] of Object.entries(resumen.idsProductos)) console.log(`  Producto     "${nombre}"           -> id ${id}`)
  for (const [nombre, id] of Object.entries(resumen.idsModificadores)) console.log(`  Modificador  "${nombre}"           -> id ${id}`)
  console.log(`  Combo        "${COMBO.nombre}"      -> id ${resumen.combo}`)
  console.log(`  Cliente      "${CLIENTE.nombre}"    -> id ${resumen.cliente} (referencias: ${CLIENTE.referencias.length})`)
  console.log(`  Repartidor   "${REPARTIDOR.nombre}" -> id ${resumen.repartidor} (usuario "${REPARTIDOR.usuario}" / "${REPARTIDOR.contraseña}")`)
  console.log('\nCreados ahora:')
  console.log(creados.length ? creados.map((c) => `  - ${c}`).join('\n') : '  (ninguno, todo ya existía)')
  console.log('\nYa existían (no se duplicaron):')
  console.log(yaExistian.length ? yaExistian.map((c) => `  - ${c}`).join('\n') : '  (ninguno)')
  console.log('\nCredenciales:  Administrador -> admin / admin123 (de prisma/seed.js)')
  console.log('               Repartidor   -> carlos / carlos123')
  console.log('\nNOTA: la caja NO se abrió. Ábrela en la UI (Caja) antes de vender.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
