import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { CATEGORIAS_GASTO, METODOS_PAGO, esEnumValido } from '../utils/enums.js'

export const crearGasto = asyncHandler(async (req, res) => {
  const { concepto, monto, categoria, metodoPago } = req.body
  if (!concepto || typeof concepto !== 'string') {
    throw new HttpError(400, 'concepto es obligatorio')
  }
  if (typeof monto !== 'number' || monto < 0) {
    throw new HttpError(400, 'monto debe ser un número mayor o igual a 0')
  }
  if (!esEnumValido(categoria, CATEGORIAS_GASTO)) {
    throw new HttpError(400, 'categoria inválida (Insumos, Servicios, Sueldos u Otro)')
  }
  if (!esEnumValido(metodoPago, METODOS_PAGO)) {
    throw new HttpError(400, 'metodoPago inválido')
  }

  const usuarioId = resolverUsuario(req)

  // Se asocia al Dia_Operativo Abierto actual; si no hay ninguno, queda null y
  // se asocia al siguiente que se abra (docs/05). Esto NO bloquea la creación.
  const dia = await prisma.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })

  const gasto = await prisma.gasto.create({
    data: {
      concepto,
      monto,
      categoria,
      metodoPago,
      diaOperativoId: dia?.id ?? null,
      origen: 'Manual',
      usuarioId,
    },
  })

  res.status(201).json({
    mensaje: 'Gasto registrado',
    gasto,
    asociadoASiguienteDia: dia ? false : true,
  })
})

export const listarGastos = asyncHandler(async (req, res) => {
  const { diaOperativoId } = req.query
  const where = {}
  if (diaOperativoId != null) {
    where.diaOperativoId = Number(diaOperativoId)
  }

  const gastos = await prisma.gasto.findMany({
    where,
    orderBy: { fechaHora: 'desc' },
    include: {
      diaOperativo: { select: { id: true, estado: true, fechaApertura: true } },
      usuario: { select: { id: true, tipo: true } },
    },
  })
  res.json(gastos)
})