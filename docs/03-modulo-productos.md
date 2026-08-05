# 03 — Módulo: Ingredientes y Productos

> Ver `00-INDICE.md` para el mapa completo. **Este es el módulo base del que dependen prácticamente todos los demás** — especialmente `04-modulo-ventas-inventario.md`, que consume estas entidades en cada venta.

## Entidad: Ingrediente

**Atributos:**
- `id`
- `nombre`
- `unidad_medida` (enum: kg, g, l, ml, pieza)
- `stock_actual` (numérico, puede ser negativo)
- `stock_minimo_alerta` (numérico)
- `costo_ultima_compra` (numérico, opcional)
- `estado` (enum: Activo, Inactivo)
- `fecha_creacion`

**Reglas de negocio:**
- Al crear un ingrediente, se captura `stock_actual` inicial (cuenta como su primera entrada de inventario — ver `Movimiento_Inventario` en `04-modulo-ventas-inventario.md`)
- Si se captura `costo_ultima_compra` al crear o al registrar una entrada, se genera automáticamente un registro en `Gasto` (ver `05-modulo-caja-gastos.md`)
- `stock_actual` puede volverse negativo (no se bloquea), se muestra como alerta visual — la lógica completa de cómo se llega a negativo vive en `04-modulo-ventas-inventario.md`, sección "Lógica: Venta con stock insuficiente"
- **Eliminar:** solo permitido si el ingrediente nunca ha sido usado en ninguna receta ni movimiento de inventario (regla transversal, ver `00-INDICE.md`)
- **Desactivar:** si está en uso en algún producto activo, el sistema debe advertir y ofrecer 3 opciones:
  - Vender esos productos sin ese ingrediente (se quita de su receta)
  - Suspender esos productos también (pasan a `disponible_hoy = false`)
  - Cancelar (no desactivar)

## Entidad: Producto

**Atributos:**
- `id`
- `nombre`
- `precio`
- `tipo` (enum: Con_receta, Reventa_directa)
- `permite_mitad_y_mitad` (booleano, solo aplicable si `tipo = Con_receta`)
- `disponible_hoy` (booleano, default true — toggle temporal, distinto de `estado`)
- `estado` (enum: Activo, Inactivo — desactivación permanente)
- `fecha_creacion`

**Reglas de negocio:**
- Si `tipo = Reventa_directa`: el producto **es su propio ingrediente**, tiene su propio `stock_actual` directamente (no pasa por `Producto_Ingrediente`). Usa el mismo flujo de "Entrada de inventario" que un ingrediente normal (ver `04-modulo-ventas-inventario.md`)
- Si `tipo = Con_receta`: requiere al menos 1 relación en `Producto_Ingrediente`
- `disponible_hoy = false`: el producto se oculta del punto de venta temporalmente, pero conserva toda su configuración
- **Eliminar:** solo si nunca se ha vendido (consultar `Venta_Producto` en `04-modulo-ventas-inventario.md` para verificar esto)
- **Desactivar:** si el producto es parte de algún `Combo` activo (ver entidad Combo en este mismo archivo), se debe advertir (informativo) antes de proceder — el combo se suspende automáticamente si el producto queda no disponible
- **IMPORTANTE — precio congelado:** el `precio` de esta tabla es el precio ACTUAL/vigente. Cuando se realiza una venta, el precio se copia y se congela en `Venta_Producto.precio_congelado` (ver `04-modulo-ventas-inventario.md`) — los reportes históricos nunca deben leer `Producto.precio` directamente para ventas pasadas

## Entidad: Producto_Ingrediente (la receta)

**Atributos:**
- `id`
- `producto_id`
- `ingrediente_id`
- `cantidad` (numérica, en la misma unidad del ingrediente)

**Reglas de negocio:**
- Un producto puede tener múltiples ingredientes (su receta completa)
- La `cantidad` siempre respeta la `unidad_medida` del ingrediente asociado — la interfaz debe mostrar la unidad junto al campo de captura (responsabilidad del usuario evitar errores, el sistema no valida rangos automáticamente)
- Si `Producto.permite_mitad_y_mitad = true`, al venderse como mitad, la `cantidad` de cada ingrediente se divide entre 2, **redondeando siempre hacia arriba** — esta lógica de división se ejecuta en el momento de la venta (ver `Venta_Producto_Mitad` en `04-modulo-ventas-inventario.md`)

## Entidad: Modificador

**Atributos:**
- `id`
- `nombre`
- `tipo` (enum: Agregar, Quitar, Sustituir)
- `ingrediente_afectado_id` (a qué ingrediente de la receta afecta)
- `ingrediente_sustituto_id` (solo si `tipo = Sustituir`)
- `cantidad_extra` (solo si `tipo = Agregar`)
- `costo_adicional` (numérico, puede ser 0)
- `estado` (Activo/Inactivo)

## Entidad: Producto_Modificador

**Atributos:**
- `id`
- `producto_id`
- `modificador_id`

**Reglas de negocio (ejecución en el momento de la venta — ver detalle completo en `04-modulo-ventas-inventario.md`, entidad `Venta_Producto_Modificador`):**
- Un modificador se asocia a uno o varios productos específicos (no es global)
- `Agregar`: descuenta `cantidad_extra` adicional del `ingrediente_afectado_id`, suma `costo_adicional` al total
- `Quitar`: no descuenta el `ingrediente_afectado_id` de la receta base
- `Sustituir`: descuenta el `ingrediente_sustituto_id` en vez del `ingrediente_afectado_id`
- Los modificadores **no aplican con alteración de precio dentro de un Combo** (el combo es precio cerrado); sí pueden aplicarse modificadores sin costo (ej. "sin cebolla") a los productos dentro de un combo

## Entidad: Combo

**Atributos:**
- `id`
- `nombre`
- `precio_especial`
- `estado` (Activo/Inactivo/Suspendido automáticamente)

## Entidad: Combo_Producto

**Atributos:**
- `id`
- `combo_id`
- `producto_id`
- `cantidad` (normalmente 1, pero permite más si aplica)

**Reglas de negocio:**
- El combo **no tiene receta propia** — el inventario se descuenta según la receta de cada `Producto` incluido (ver `04-modulo-ventas-inventario.md` para la ejecución exacta al momento de la venta)
- Si algún producto incluido no tiene stock suficiente: se bloquea la venta del combo completo, ofreciendo vender por separado lo disponible:
  - "Precio real" = suma de precios normales (`Producto.precio`) de los productos disponibles (sin descuento de combo)
  - "Otro precio" = monto manual capturado por el Administrador
- Si algún producto incluido se marca `disponible_hoy = false`: el combo se suspende automáticamente (`Combo.estado = Suspendido`) y se genera un aviso
- Si cambia el `precio` de un producto incluido en un combo activo: se muestra aviso informativo (no bloqueante) con acceso directo a revisar/editar el combo

## Conexión directa con otros módulos

- **`04-modulo-ventas-inventario.md`:** cada venta consume `Producto`, `Producto_Ingrediente`, `Producto_Modificador` y `Combo_Producto` para calcular qué descontar de inventario y qué cobrar
- **`06-modulo-pedidos-clientes.md`:** los pedidos referencian estos mismos `Producto` y `Combo` al capturar qué se está pidiendo
- **`07-modulo-roles.md`:** solo el Administrador puede crear/editar/desactivar cualquier entidad de este archivo
