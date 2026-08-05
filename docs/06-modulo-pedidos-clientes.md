# 06 — Módulo: Clientes, Pedidos y Repartidores

> Ver `00-INDICE.md` para el mapa completo. **Este es el módulo más interconectado del sistema** — depende simultáneamente de `03-modulo-productos.md` (qué se pide), `04-modulo-ventas-inventario.md` (genera Ventas automáticamente) y `05-modulo-caja-gastos.md` (afecta el cierre de caja). Léelo siempre junto con esos tres archivos si vas a implementar algo aquí.

## Entidad: Cliente

**Atributos:**
- `id`
- `nombre`
- `telefono` (opcional)
- `estado` (enum: Activo, Inactivo)
- `fecha_creacion`

**Reglas de negocio:**
- **Eliminar:** solo si nunca ha tenido ningún pedido asociado (regla transversal, ver `00-INDICE.md`)
- **Desactivar:** si ya tiene historial de pedidos, se desactiva en vez de eliminar (conserva historial intacto)
- Puede repetirse la misma referencia entre clientes distintos sin ningún conflicto (no se valida duplicidad)

## Entidad: Cliente_Referencia

**Atributos:**
- `id`
- `cliente_id`
- `descripcion` (texto libre, tipo landmark: "casa azul, frente a la tienda de don Beto" — ver contexto en `01-contexto-negocio.md`)
- `estado` (Activo/Inactivo)

**Reglas de negocio:**
- Un cliente puede tener múltiples referencias (casa, trabajo, etc.)
- Al capturar un pedido a domicilio, se puede seleccionar una referencia existente o agregar una nueva en el momento

## Entidad: Empleado (Repartidor)

**Atributos:**
- `id`
- `nombre`
- `usuario` / `contraseña` (login individual — ver `07-modulo-roles.md`)
- `tipo` (fijo: Repartidor — el Administrador es usuario único, no se registra aquí)
- `estado_disponibilidad` (enum: Disponible, No_disponible_hoy, Inactivo)
- `fecha_creacion`

**Reglas de negocio:**
- `No_disponible_hoy`: no aparece en la lista para asignar pedidos, pero conserva su cuenta y no pierde historial (para ausencias puntuales, ej. no asistió ese día)
- `Inactivo`: ya no trabaja ahí, se desactiva (no se elimina, para no perder trazabilidad de sus entregas pasadas)
- Sesión de login persistente en su dispositivo (no requiere reautenticarse cada vez que abre la app — relevante porque puede perder señal en la calle, ver `01-contexto-negocio.md`)
- No tiene un rol "fijo" que le impida operar como tal en cualquier momento — cualquier empleado dado de alta como Repartidor puede ser asignado a un pedido

## Entidad: Pedido

**Atributos:**
- `id`
- `tipo` (enum: Para_recoger, A_domicilio) — se define al capturar, **no cambia después**
- `origen` (enum: Mostrador, Telefono) — determina si el cliente estaba presente físicamente al capturar
- `estado_preparacion` (enum: Pendiente, En_preparacion, Enviado, Entregado, Cancelado)
- `estado_pago` (enum: Pendiente_pago, Pagado) — **independiente** del estado de preparación
- `cliente_id` (opcional, referencia a `Cliente`)
- `nombre_cliente_libre` (texto, si no está registrado)
- `referencia_id` (solo si `tipo = A_domicilio`, referencia a `Cliente_Referencia`)
- `costo_envio` (solo si `tipo = A_domicilio`, tomado de configuración; se omite si `no_cobrar = true`)
- `repartidor_id` (null hasta que se asigna, solo aplica si `tipo = A_domicilio`, referencia a `Empleado`)
- `metodo_pago` (enum: Efectivo, Tarjeta, Transferencia — ver restricciones abajo)
- `monto_referencia_pago` (el billete seleccionado, ej. $200 — solo si `metodo_pago = Efectivo` y `no_cobrar = false`)
- `cambio_a_llevar` (calculado: `monto_referencia_pago - total`)
- `no_cobrar` (booleano)
- `total` (recalculado automáticamente ante cualquier edición)
- `fecha_hora_creacion`
- `venta_id` (referencia de solo lectura, se llena automáticamente — ver regla en `04-modulo-ventas-inventario.md`, "Conexión con Módulo de Pedidos")

**Reglas de negocio clave:**

- **Tipo de pedido no se puede cambiar una vez capturado** — si el cliente cambia de opinión (para recoger ↔ domicilio), se cancela ese pedido (con la lógica de regresar o no inventario, ver más abajo) y se crea uno nuevo
- **Origen:** si el cliente no está presente físicamente al capturar, siempre es `Telefono`, sin importar qué tan rápido diga que llegará o pagará. Un cliente presente en mostrador que pide que le envíen el pedido a otro lugar (pagando hasta la entrega) SÍ es `Mostrador + A_domicilio` — combinación válida
- **Estado de pago:**
  - `Mostrador + Para_recoger`: normalmente se cobra al capturar (pasa directo a `Pagado`)
  - Cualquier otro caso (`Telefono` o `A_domicilio`): inicia en `Pendiente_pago`, cambia a `Pagado` cuando el cliente paga (al recoger) o el repartidor cobra (al entregar)
  - **Al pasar a `Pagado`, se dispara la generación automática de `Venta` — ver regla completa en `04-modulo-ventas-inventario.md`**
- **Métodos de pago disponibles:**
  - Si `tipo = Para_recoger`: Efectivo, Tarjeta, Transferencia (default Efectivo)
  - Si `tipo = A_domicilio`: solo Efectivo, Transferencia (default Efectivo) — sin Tarjeta, porque el repartidor no carga terminal
- **Cambio a llevar:** obligatorio si `metodo_pago = Efectivo` y `no_cobrar = false` — no existe opción de "pago exacto", siempre debe seleccionarse una opción de billete configurada por el Administrador (lista configurable, no un monto fijo único)
- **Asignación de repartidor:** ocurre al momento de cambiar `estado_preparacion` a `Enviado`, no antes. Si existe configuración de "repartidor único" activa, se asigna automático sin preguntar

### Matriz completa de combinaciones válidas (Origen x Tipo)

```
Mostrador + Para_recoger  → Normal, se cobra al momento
Mostrador + A_domicilio   → Pendiente de pago, cobra el repartidor en la entrega
Telefono  + Para_recoger  → Pendiente de pago, cobra al llegar a recoger
Telefono  + A_domicilio   → Pendiente de pago, cobra el repartidor en la entrega
```
Las 4 combinaciones son válidas y se resuelven con los mismos 3 campos (`origen`, `tipo`, `estado_pago`) sin necesitar lógica adicional.

## Lógica: Edición de un pedido activo

**Flujo:**
- Permitido mientras `estado_preparacion` esté en `Pendiente` o `En_preparacion`
- Al agregar/quitar productos o modificadores (ver `03-modulo-productos.md`): se recalcula `total` y `cambio_a_llevar` automáticamente
- Al quitar un producto: el sistema siempre pregunta si el ingrediente/producto se regresa a inventario (genera `Movimiento_Inventario` tipo `Cancelacion_regreso` si aplica — ver `04-modulo-ventas-inventario.md`)
- No editable una vez `Enviado` o `Entregado` (solo cancelable)

## Lógica: Cancelación de un pedido

**Flujo:**
- Disponible en cualquier `estado_preparacion` antes de `Entregado`
- Siempre pregunta: "¿Los ingredientes se regresan al inventario o ya se usaron/perdieron?"
- Si se confirma regreso: genera `Movimiento_Inventario` tipo `Cancelacion_regreso` por cada ingrediente correspondiente (ver `04-modulo-ventas-inventario.md`)
- `estado_preparacion` pasa a `Cancelado`

## Lógica: Consumo interno en pedidos a domicilio

- Si `no_cobrar = true` en un pedido `A_domicilio`: se omite `costo_envio` y `monto_referencia_pago`/`cambio_a_llevar` (no aplican, no hay cobro de por medio) — ver regla general de "No cobrar" en `04-modulo-ventas-inventario.md`

## Conexión directa con otros módulos

- **`03-modulo-productos.md`:** el pedido referencia `Producto` y `Combo` al capturar qué se pide
- **`04-modulo-ventas-inventario.md`:** al pasar a `Pagado`, genera automáticamente una `Venta`; las cancelaciones/ediciones generan `Movimiento_Inventario`
- **`05-modulo-caja-gastos.md`:** los pedidos `Pendiente_pago` sin resolver se muestran como aviso al cerrar caja
- **`07-modulo-roles.md`:** el `Empleado (Repartidor)` es un tipo de `Usuario` con permisos limitados definidos ahí
