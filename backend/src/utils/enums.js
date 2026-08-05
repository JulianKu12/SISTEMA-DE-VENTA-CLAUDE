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
export const CATEGORIAS_GASTO = ['Insumos', 'Servicios', 'Sueldos', 'Otro']
export const MOTIVOS_DEVOLUCION = ['Producto_mal_estado', 'Pedido_incorrecto', 'Cliente_insatisfecho', 'Otro']
export const MEDIOS_DEVOLUCION = ['Efectivo', 'Tarjeta', 'Transferencia', 'Efectivo_de_caja']
export const TIPOS_PEDIDO = ['Para_recoger', 'A_domicilio']
export const ORIGENES_PEDIDO = ['Mostrador', 'Telefono']
export const ESTADOS_PREPARACION = ['Pendiente', 'En_preparacion', 'Enviado', 'Entregado', 'Cancelado']
export const ESTADOS_PAGO = ['Pendiente_pago', 'Pagado']
export const ESTADOS_DISPONIBILIDAD = ['Disponible', 'No_disponible_hoy', 'Inactivo']

export const esEnumValido = (valor, valores) => valores.includes(valor)