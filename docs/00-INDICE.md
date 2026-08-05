# Índice — Sistema POS para Loncherías

> **Instrucción para cualquier asistente de IA (OpenCode, Claude, etc.) que trabaje con estos archivos:**
> Este proyecto está documentado en múltiples archivos que **se referencian entre sí constantemente**. Ningún módulo es 100% independiente — antes de implementar cualquier funcionalidad, lee este índice para saber qué otros archivos debes consultar en conjunto. Ignorar las referencias cruzadas producirá inconsistencias reales (ya identificadas y corregidas durante la planeación).

## Orden de lectura recomendado

1. `01-contexto-negocio.md` — qué es el proyecto y por qué existe
2. `02-stack-tecnico.md` — con qué se construye
3. `03-modulo-productos.md` — la base de todo (ingredientes, productos, recetas, modificadores, combos)
4. `04-modulo-ventas-inventario.md` — depende 100% del archivo 03
5. `05-modulo-caja-gastos.md` — depende de 04 (las ventas alimentan la caja)
6. `06-modulo-pedidos-clientes.md` — depende de 03, 04 y 05 simultáneamente (es el módulo más interconectado)
7. `07-modulo-roles.md` — depende de todos los anteriores (define quién puede hacer qué)
8. `08-lista-tareas.md` — el roadmap de desarrollo, organizado en el mismo orden de dependencia

## Mapa de dependencias entre entidades (para no perder ninguna conexión)

Esta tabla es la más importante del índice. Muestra qué entidad de qué archivo depende de o afecta a una entidad de otro archivo.

| Entidad | Vive en | Depende de / Afecta a | Archivo relacionado |
|---|---|---|---|
| `Producto_Ingrediente` (receta) | 03 | Se consume en cada venta | 04 |
| `Combo_Producto` | 03 | Se descuenta como productos individuales al vender | 04 |
| `Movimiento_Inventario` | 04 | Se genera automáticamente por: ventas (03→04), entradas manuales, devoluciones (05), cancelaciones/ediciones de pedido (06) | 03, 05, 06 |
| `Venta.dia_operativo_id` | 04 | Toda Venta se asocia SIEMPRE al `Dia_Operativo` abierto, sin importar si la generó un Administrador o un Repartidor (07) | 05, 07 |
| `Venta_Producto.precio_congelado` | 04 | Se copia del `Producto.precio` (03) al momento exacto de la venta, nunca se actualiza después | 03 |
| `Pedido.metodo_pago` / `Pedido.total` | 06 | Al pasar `estado_pago` a `Pagado`, se genera automáticamente una `Venta` (04) con estos datos copiados | 04 |
| `Pedido.estado_pago = Pagado` | 06 | Dispara la creación de `Venta` (ver regla exacta en 04, sección "Conexión con Módulo de Pedidos") | 04 |
| `Gasto.dia_operativo_id` | 05 | Puede ser null si no hay caja abierta; se asocia al siguiente `Dia_Operativo` que abra | 05 |
| `Devolucion` | 05 | Puede regresar inventario (`Movimiento_Inventario` tipo `Devolucion_regreso`) | 04 |
| `Empleado (Repartidor)` | 06 | Su tipo de usuario y permisos se rigen por | 07 |
| `Usuario.tipo = Administrador` | 07 | Es quien ejecuta casi todas las acciones descritas en 03, 04, 05 y 06 | 03, 04, 05, 06 |
| `Usuario.tipo = Repartidor` | 07 | Solo puede tocar: `Pedido.estado_preparacion = Entregado` y `Venta.no_cobrar` (06, 04) | 04, 06 |

## Reglas transversales (aplican a TODO el sistema, sin importar el módulo)

Estas reglas no viven en un solo archivo porque aplican de forma pareja en todos lados. Cualquier prompt que toque estas áreas debe respetarlas:

1. **Eliminar vs. Desactivar:** ninguna entidad con historial relacionado se elimina de verdad, solo se desactiva (`estado = Inactivo`). Solo se permite eliminar si nunca tuvo ninguna transacción asociada. Aplica a: Ingrediente, Producto, Cliente, Empleado (03, 06).
2. **Precio/costo congelado en el momento de la transacción:** tanto `Venta_Producto.precio_congelado` (04) como los montos de `Gasto` y `Devolucion` (05) reflejan el valor exacto en el momento en que ocurrieron, nunca un valor recalculado después.
3. **Todo movimiento de inventario queda auditado:** cualquier cambio de stock (venta, entrada, ajuste, devolución, cancelación) SIEMPRE genera un registro en `Movimiento_Inventario` (04) — nunca se modifica `stock_actual` directamente sin dejar rastro.
4. **"No cobrar" es transversal:** aplica igual en venta de mostrador (04) y en pedidos a domicilio (06), con la misma regla de auditoría (07 define quién puede usarlo: cualquier usuario).

## Instrucción específica para prompts de OpenCode

Cuando generes un prompt para OpenCode pidiendo que implemente una funcionalidad:
- Si la funcionalidad toca más de una entidad de la tabla de dependencias de arriba, **el prompt debe indicar explícitamente a OpenCode que lea ambos archivos relacionados**, no solo el módulo "principal" de esa funcionalidad.
- Ejemplo: un prompt para "implementar el cierre de caja" debe decirle a OpenCode que lea `05-modulo-caja-gastos.md` Y `04-modulo-ventas-inventario.md` (porque el cálculo de efectivo esperado depende de las Ventas).
