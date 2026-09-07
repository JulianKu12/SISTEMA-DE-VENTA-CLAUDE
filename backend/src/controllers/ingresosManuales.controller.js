import prisma from '../models/prisma.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { HttpError } from '../utils/httpError.js'
import { resolverUsuario } from '../utils/usuario.js'
import { METODOS_PAGO, esEnumValido } from '../utils/enums.js'

export const crearIngresoManual = asyncHandler(async (req, res) => {
  const { monto, metodoPago, motivo } = req.body
  if (typeof monto !== 'number' || monto <= 0) {
    throw new HttpError(400, 'monto debe ser un número mayor a 0')
  }
  if (!motivo || typeof motivo !== 'string' || !motivo.trim()) {
    throw new HttpError(400, 'motivo es obligatorio (texto libre para auditoría)')
  }
  if (!esEnumValido(metodoPago, METODOS_PAGO)) {
    throw new HttpError(400, 'metodoPago inválido (Efectivo, Tarjeta o Transferencia)')
  }

  const usuarioId = resolverUsuario(req)

  const dia = await prisma.dia_Operativo.findFirst({ where: { estado: 'Abierto' } })

  const ingreso = await prisma.ingresoManual.create({
    data: {
      monto,
      metodoPago,
      motivo: motivo.trim(),
      diaOperativoId: dia?.id ?? null,
      usuarioId,
    },
  })

  res.status(201).json({
    mensaje: 'Ingreso manual registrado',
    ingreso,
    asociadoASiguienteDia: dia ? false : true,
  })
})

export const listarIngresosManuales = asyncHandler(async (req, res) => {
  const { diaOperativoId } = req.query
  const where = {}
  if (diaOperativoId != null) {
    where.diaOperativoId = Number(diaOperativoId)
  }

  const ingresos = await prisma.ingresoManual.findMany({
    where,
    orderBy: { fechaHora: 'desc' },
    include: {
      diaOperativo: { select: { id: true, estado: true, fechaApertura: true } },
      usuario: { select: { id: true, tipo: true, nombre: true } },
    },
  })
  res.json(ingresos)
})