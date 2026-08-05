# 04 — Módulo: Punto de Venta e Inventario

> Ver `00-INDICE.md` para el mapa completo. **Este módulo depende 100% de `03-modulo-productos.md`** (consume Producto, Producto_Ingrediente, Modificador, Combo). También se conecta fuertemente con `05-modulo-caja-gastos.md` (toda Venta afecta el corte de caja) y con `06-modulo-pedidos-clientes.md` (los Pedidos generan Ventas automáticamente).

## Entidad: Venta

**Atributos:**
- `id`
- `fecha_hora`
- `pedido_id` (opcional/null — si es null, es venta directa de mostrador sin pedido de por medio; si tiene valor, referencia a `Pedido` en `06-modulo-pedidos-clientes.md`)
- `total`
- `metodo_pago` (enum: Efectivo, Tarjeta, Transferencia — default Efectivo)
- `no_cobrar` (booleano, default false)
- `usuario_id` (quién la registró — ver `07-modulo-roles.md` para tipos de usuario)
- `dia_operativo_id` (referencia a `Dia_Operativo`, ver `05-modulo-caja-gastos.md`)
- `es_venta_previa_apertura` (booleano, default false)

**Reglas de negocio:**
- El origen (Mostrador/Teléfono) y tipo (Para_recoger/A_domicilio) de una venta se consultan a través de `Venta.pedido_id → Pedido.origen / Pedido.tipo` (ver `06-modulo-pedidos-clientes.md`), cuando aplica. Si `pedido_id = null`, se asume venta directa de mostrador
- **REGLA CRÍTICA:** toda `Venta`, sin importar qué tipo de usuario la genere (Administrador o Repartidor — ver `07-modulo-roles.md`), se asocia siempre al `Dia_Operativo` en estado `Abierto` al momento de crearse (ver `05-modulo-caja-gastos.md`)
- Si `no_cobrar = true`: se oculta/omite `metodo_pago`, no suma a ventas del corte de caja (ver `05-modulo-caja-gastos.md`), no participa en ningún cálculo de ganancia neta, solo se registra en el historial de auditoría (quién, qué, cuándo — visible solo para Administrador, ver `07-modulo-roles.md`)
- Si `es_venta_previa_apertura = true`: solo afecta inventario, no se cuenta en ningún corte de caja
- `total` se calcula sumando cada `Venta_Producto` con su precio y modificadores aplicados

## Conexión con Módulo de Pedidos (regla exacta de generación automática)

Esta es una de las reglas más importantes del sistema, corregida durante la revisión cruzada de módulos:

> Cuando `Pedido.estado_pago` (ver `06-modulo-pedidos-clientes.md`) cambia de `Pendiente_pago` a `Pagado`, el sistema genera **automáticamente** el registro `Venta` correspondiente:
> - Copia `Pedido.metodo_pago` → `Venta.metodo_pago`
> - Copia `Pedido.total` y cada producto del pedido → `Venta_Producto` (con su `precio_congelado`)
> - Asigna `pedido_id` apuntando a este pedido
> - Esta Venta se asocia al `Dia_Operativo` abierto en ese momento
>
> El campo `Pedido.venta_id` es una referencia de solo lectura que se llena automáticamente en este momento, no antes.

## Entidad: Venta_Producto

**Atributos:**
- `id`
- `venta_id`
- `producto_id` (referencia a `Producto`, ver `03-modulo-productos.md`)
- `cantidad`
- `precio_congelado` (el precio del producto AL MOMENTO de la venta, copiado de `Producto.precio` en ese instante — NUNCA depende del precio actual del producto)
- `es_mitad_y_mitad` (booleano)
- `combo_id` (opcional, si este producto es parte de un combo vendido — referencia a `Combo` en `03-modulo-productos.md`)

**Reglas de negocio:**
- `precio_congelado` siempre se guarda en el momento de la venta — los reportes históricos usan este campo, nunca `Producto.precio` actual (regla transversal, ver `00-INDICE.md`)
- Si `es_mitad_y_mitad = true`, requiere registro en `Venta_Producto_Mitad`

## Entidad: Venta_Producto_Mitad

**Atributos:**
- `id`
- `venta_producto_id`
- `sabor_1_producto_id`
- `sabor_2_producto_id`

**Regla de negocio:** solo aplica si el `Producto` original tiene `permite_mitad_y_mitad = true` (ver `03-modulo-productos.md`). La división de cantidades de receta al 50% con redondeo hacia arriba se ejecuta aquí, al momento de crear este registro.

## Entidad: Venta_Producto_Modificador

**Atributos:**
- `id`
- `venta_producto_id`
- `modificador_id` (referencia a `Modificador`, ver `03-modulo-productos.md`)
- `costo_aplicado` (congelado al momento de la venta, igual que el precio)

## Entidad: Movimiento_Inventario

**Atributos:**
- `id`
- `ingrediente_id` (o `producto_id` si es tipo Reventa_directa — ver `03-modulo-productos.md`)
- `tipo_movimiento` (enum: Entrada, Salida_venta, Ajuste, Devolucion_regreso, Cancelacion_regreso)
- `cantidad`
- `motivo` (solo aplica si `tipo_movimiento = Ajuste`: Conteo_fisico, Merma, Otro)
- `fecha_hora`
- `referencia_id` (id de la venta, devolución o cancelación que originó el movimiento, si aplica)

**Reglas de negocio:**
- Cada venta genera automáticamente sus `Movimiento_Inventario` tipo `Salida_venta`, uno por cada ingrediente de la receta (ajustado por modificadores y mitad/mitad)
- Las entradas de inventario generan `tipo_movimiento = Entrada`, y si tienen costo, generan un `Gasto` asociado automáticamente (ver `05-modulo-caja-gastos.md`)
- `Movimiento_Inventario` tipo `Devolucion_regreso` se genera desde el módulo de Devoluciones (ver `05-modulo-caja-gastos.md`)
- `Movimiento_Inventario` tipo `Cancelacion_regreso` se genera desde la lógica de cancelación/edición de pedidos (ver `06-modulo-pedidos-clientes.md`)
- El `stock_actual` del ingrediente/producto (en `03-modulo-productos.md`) es siempre el resultado de sumar todos sus movimientos históricos (o se mantiene como campo calculado/cacheado por rendimiento, actualizado en cada movimiento)
- **Regla transversal:** cualquier cambio de stock SIEMPRE genera un registro aquí — nunca se modifica `stock_actual` directamente sin dejar rastro (ver `00-INDICE.md`)

## Lógica: Venta con stock insuficiente

Esta es la función que resuelve el dolor #1 del negocio (ver `01-contexto-negocio.md`).

**Flujo:**
1. Al agregar un producto a la venta, el sistema valida si hay stock suficiente para su receta completa (consultando `Producto_Ingrediente` en `03-modulo-productos.md`)
2. Si falta: muestra alerta con la cantidad disponible
3. Ofrece botón único: "Usar los [X] disponibles y continuar"
4. Si se confirma: el `Movimiento_Inventario` de ese ingrediente registra **la cantidad realmente disponible**, no la cantidad completa de la receta (evita que el stock quede en negativo por error de cálculo cuando en realidad se usó todo lo que había — ej. si la receta pide 3 y solo hay 2, se descuentan 2, quedando en 0, no en -1)

## Lógica: Stock negativo y ajustes

- `stock_actual` puede ser negativo (representa: compra no registrada, error de conteo, o venta consciente sin stock — ver `03-modulo-productos.md`)
- Se corrige automáticamente al registrar una entrada de inventario real
- Función de **Ajuste manual de inventario:**
  1. Formulario: ingrediente/producto, stock actual (mostrado, según sistema), stock real contado, motivo (Conteo_fisico, Merma, Otro)
  2. Genera `Movimiento_Inventario` tipo `Ajuste`, con la diferencia (positiva o negativa) y el motivo asociado
  3. No genera ningún gasto ni afecta caja, solo corrige el `stock_actual`

## Lógica: Consumo interno ("No cobrar")

**Flujo:**
1. Checkbox en la pantalla de venta: "No cobrar" (cualquier tipo de `Usuario` puede marcarlo — ver `07-modulo-roles.md`)
2. Al marcarlo, se oculta el selector de método de pago
3. Al confirmar: se generan los `Movimiento_Inventario` normales (descuenta como cualquier venta)
4. La `Venta` resultante tiene `no_cobrar = true`, por lo que:
   - No suma a "Ventas del día"
   - No entra al corte de caja (ver `05-modulo-caja-gastos.md`)
   - Aparece solo en el reporte informativo de consumo interno (producto, costo, usuario que lo marcó, hora)
5. **Si el pedido es a domicilio con `no_cobrar = true`:** también se omite `costo_envio` y `cambio_a_llevar` — ver `06-modulo-pedidos-clientes.md`

## Lógica: Registro de entrada de inventario

**Flujo:**
1. Formulario: selecciona ingrediente o producto (tipo Reventa_directa, ver `03-modulo-productos.md`), captura cantidad agregada y costo opcional
2. Genera `Movimiento_Inventario` tipo `Entrada`
3. Si se capturó costo: genera automáticamente un registro en `Gasto` (categoría "Insumos") — ver `05-modulo-caja-gastos.md`
4. Sube el `stock_actual` correspondiente

## Conexión directa con otros módulos

- **`03-modulo-productos.md`:** fuente de toda la configuración de productos/recetas que este módulo consume
- **`05-modulo-caja-gastos.md`:** toda `Venta` con `metodo_pago = Efectivo` y `no_cobrar = false` alimenta el cálculo de `efectivo_esperado` en el cierre de caja
- **`06-modulo-pedidos-clientes.md`:** los `Pedido` generan `Venta` automáticamente al pasar a `Pagado` (ver regla exacta arriba)
