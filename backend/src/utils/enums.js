export const UNIDADES_MEDIDA = ['kg', 'g', 'l', 'ml', 'pieza']
export const TIPOS_PRODUCTO = ['Con_receta', 'Reventa_directa']
export const TIPOS_MODIFICADOR = ['Agregar', 'Quitar', 'Sustituir']
export const ESTADOS = ['Activo', 'Inactivo']
export const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia']
export const TIPOS_MOVIMIENTO_INVENTARIO = [
  'Entrada',
  'Salida_venta',
  'Ajuste',
  'Devolucion_regreso',
  'Cancelacion_regreso',
]
export const MOTIVOS_AJUSTE = ['Conteo_fisico', 'Merma', 'Otro']

export const esEnumValido = (valor, valores) => valores.includes(valor)