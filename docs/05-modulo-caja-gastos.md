# 05 — Módulo: Caja y Gastos

> Ver `00-INDICE.md` para el mapa completo. **Este módulo depende de `04-modulo-ventas-inventario.md`** (el cálculo de caja se alimenta de las Ventas) y se conecta con `06-modulo-pedidos-clientes.md` (pedidos pendientes de pago afectan el aviso al cerrar caja).

## Entidad: Dia_Operativo

**Atributos:**
- `id`
- `fecha_apertura` (fecha y hora)
- `fecha_cierre` (fecha y hora, null mientras sigue abierto)
- `fondo_inicial` (numérico)
- `efectivo_contado` (numérico, capturado al cerrar)
- `estado` (enum: Abierto, Cerrado)
- `usuario_id` (quién abrió/cerró — ver `07-modulo-roles.md`, siempre Administrador)

**Reglas de negocio:**
- Reemplaza el concepto de "día calendario" para efectos de reportes — un "día operativo" dura desde que se abre caja hasta que se cierra, sin importar si cruza medianoche
- **Toda `Venta` (ver `04-modulo-ventas-inventario.md`), `Gasto` y `Devolucion` (definidas en este archivo) que ocurren mientras está abierto quedan asociadas a este `dia_operativo_id`**
- No puede haber 2 `Dia_Operativo` en estado `Abierto` al mismo tiempo
- Al intentar abrir uno nuevo, si existen `Pedido` en estado `Pendiente_pago` sin resolver del periodo anterior (ver `06-modulo-pedidos-clientes.md`), el sistema los deja pasar al nuevo periodo sin bloquear la apertura (ya se avisó al momento del cierre anterior)

## Lógica: Apertura de caja

**Flujo:**
1. Se captura `fondo_inicial`
2. El sistema pregunta: "¿Hubo ventas antes de abrir (con la caja cerrada)?"
3. Si sí: permite capturar productos vendidos (mismo flujo que una venta normal, ver `04-modulo-ventas-inventario.md`), generando `Venta` con `es_venta_previa_apertura = true` — afecta inventario, no afecta este ni ningún corte de caja
4. Se crea el `Dia_Operativo` en estado `Abierto`

## Lógica: Cierre de caja

**Cálculo del efectivo esperado:**
```
efectivo_esperado = fondo_inicial
                   + SUMA(Venta.total WHERE metodo_pago = Efectivo AND no_cobrar = false)
                   - SUMA(Gasto.monto WHERE metodo_pago = Efectivo)
                   - SUMA(Devolucion.monto WHERE medio_devolucion = Efectivo_de_caja)
```
> Nota: `Venta` es la entidad definida en `04-modulo-ventas-inventario.md`. Este cálculo es la razón por la que este módulo depende directamente de ese archivo.

**Flujo:**
1. Sistema muestra `efectivo_esperado` calculado
2. Se captura `efectivo_contado` (conteo físico real)
3. Se calcula `diferencia = efectivo_contado - efectivo_esperado`
4. Antes de cerrar, el sistema avisa (no bloquea):
   - Cuántos `Pedido` siguen en estado `Pendiente_pago` sin resolver (ver `06-modulo-pedidos-clientes.md`)
   - Informativamente, cuánto dinero corresponde a repartidores aún en la calle (pedidos `Entregado` pero con `Pedido.estado_pago = Pendiente_pago`) — esto NO se considera un problema grave, solo informativo
5. Se marca `Dia_Operativo.estado = Cerrado`, se guarda `fecha_cierre`, `efectivo_contado` y la `diferencia` calculada

**Ventas con Tarjeta/Transferencia:**
- Se muestran en el resumen de cierre como bloque informativo aparte, **no se suman ni restan del cálculo de efectivo esperado**

## Entidad: Gasto

**Atributos:**
- `id`
- `concepto`
- `monto`
- `categoria` (enum: Insumos, Servicios, Sueldos, Otro)
- `metodo_pago` (enum: Efectivo, Tarjeta, Transferencia)
- `fecha_hora`
- `dia_operativo_id` (puede ser **null** si se registra sin caja abierta)
- `origen` (enum: Manual, Automatico_por_entrada_inventario)
- `usuario_id` (siempre Administrador, ver `07-modulo-roles.md` — es el único que puede registrar gastos manuales)

**Reglas de negocio:**
- Solo el Administrador puede crear un `Gasto` de forma manual (ver matriz de permisos en `07-modulo-roles.md`)
- Los gastos con `origen = Automatico_por_entrada_inventario` se generan solos cuando se registra una entrada de inventario con costo capturado (ver `04-modulo-ventas-inventario.md`, "Lógica: Registro de entrada de inventario")
- Solo los gastos con `metodo_pago = Efectivo` afectan el cálculo de `efectivo_esperado` del corte de caja
- **Si `dia_operativo_id = null`** (sin caja abierta en ese momento): se asocia automáticamente al **siguiente** `Dia_Operativo` que se abra, siguiendo la misma lógica ya usada para ventas previas a apertura

## Entidad: Devolucion

**Atributos:**
- `id`
- `venta_id` (la venta original, no se modifica — referencia a `Venta` en `04-modulo-ventas-inventario.md`)
- `monto` (puede ser parcial)
- `motivo` (enum: Producto_mal_estado, Pedido_incorrecto, Cliente_insatisfecho, Otro)
- `medio_pago_original` (heredado de la venta)
- `medio_devolucion` (enum: mismo que el original, o Efectivo_de_caja)
- `regresa_a_inventario` (booleano)
- `fecha_hora`
- `dia_operativo_id`

**Reglas de negocio:**
- No modifica ni borra la `Venta` original (se mantiene intacta para trazabilidad)
- Si `regresa_a_inventario = true`: genera `Movimiento_Inventario` tipo `Devolucion_regreso` (suma stock de vuelta — ver `04-modulo-ventas-inventario.md`)
- Si `medio_devolucion = Efectivo_de_caja` y el `medio_pago_original` no era efectivo: esta devolución sí resta del `efectivo_esperado` en el corte de caja, aunque la venta original no haya sido en efectivo
- Reporte de devoluciones debe exponer: producto, costo, medio de pago original, medio de devolución

## Conexión directa con otros módulos

- **`04-modulo-ventas-inventario.md`:** todo el cálculo de caja depende de las `Venta` generadas ahí; las `Devolucion` generan `Movimiento_Inventario`
- **`06-modulo-pedidos-clientes.md`:** el aviso al cerrar caja considera `Pedido.estado_pago = Pendiente_pago`
- **`07-modulo-roles.md`:** solo Administrador abre/cierra caja y registra gastos manuales
