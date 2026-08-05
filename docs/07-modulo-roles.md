# 07 — Módulo: Roles y Permisos

> Ver `00-INDICE.md` para el mapa completo. Este módulo **no introduce entidades de negocio nuevas** — define quién puede ejecutar las acciones ya descritas en `03`, `04`, `05` y `06`. Debe leerse en conjunto con esos archivos para entender el efecto real de cada permiso.

## Entidad: Usuario (sesión)

**Atributos:**
- `id`
- `tipo` (enum: Administrador, Repartidor)
- `nombre` (solo relevante para Repartidor; el Administrador es una cuenta única fija)
- `usuario` / `contraseña`
- `token_sesion` (para mantener la sesión persistente en el dispositivo)

**Reglas de negocio:**
- Existe **un solo usuario tipo Administrador**, fijo desde la instalación/configuración inicial del sistema — no hay pantalla para "registrar más administradores"
- Los usuarios tipo Repartidor sí se registran de forma individual (uno por cada persona), a través de la pantalla de alta de repartidor (ver `Empleado` en `06-modulo-pedidos-clientes.md`)
- El Administrador puede ser usado por el dueño o por quien esté cobrando, compartiendo el mismo login en el mismo dispositivo — el sistema no distingue entre ellos en el registro de auditoría, ambos aparecen como "Administrador" en cualquier historial (ver `04-modulo-ventas-inventario.md`, auditoría de "No cobrar")
- Sesión persistente: una vez logueado, el dispositivo no vuelve a pedir credenciales salvo cierre de sesión manual (relevante sobre todo para el Repartidor, que puede perder señal en la calle — ver `01-contexto-negocio.md`)

## Matriz de permisos

| Acción | Administrador | Repartidor | Módulo relacionado |
|---|---|---|---|
| Configurar ingredientes/productos/modificadores/combos | ✅ | ❌ | `03` |
| Registrar entrada de inventario / ajustes | ✅ | ❌ | `04` |
| Tomar pedidos (mostrador y teléfono) | ✅ | ❌ | `06` |
| Ver todos los pedidos | ✅ | ❌ (solo los suyos asignados) | `06` |
| Cambiar estado de pedido a En_preparacion / asignar repartidor al marcar Enviado | ✅ | ❌ | `06` |
| Cambiar estado de pedido a Entregado (solo el suyo) | ❌ | ✅ | `06` |
| Marcar "No cobrar" | ✅ | ✅ | `04`, `06` |
| Registrar gastos | ✅ | ❌ | `05` |
| Abrir/cerrar caja | ✅ | ❌ | `05` |
| Ver reportes completos (ventas, gastos, devoluciones, corte de caja) | ✅ | ❌ | `04`, `05` |
| Registrar devoluciones | ✅ | ❌ | `05` |
| Dar de alta clientes / repartidores | ✅ | ❌ | `06` |
| Marcar productos "no disponible hoy" | ✅ | ❌ | `03` |
| Ver historial de auditoría de "No cobrar" | ✅ | ❌ | `04` |

**Reglas de negocio:**
- El Repartidor solo tiene acceso a: lista de sus pedidos asignados (con referencia, total, cambio a llevar mostrado claramente por pedido si tiene varios — ver `06-modulo-pedidos-clientes.md`), botón para marcar "Entregado", y el checkbox de "No cobrar" si aplica en su entrega
- Cualquier función no listada explícitamente para Repartidor le está bloqueada por default (fail-safe: por defecto denegado, no permitido)

## Nota de diseño consciente sobre el usuario Administrador compartido

Esta decisión fue tomada explícitamente durante la planeación: como en un negocio pequeño normalmente solo hay una persona (el dueño) o una de mucha confianza cobrando, no se justificó construir un sistema de múltiples cuentas de Administrador. El control de que los empleados no abusen del sistema (ej. marcar "No cobrar" de más) es responsabilidad del dueño observando el historial de auditoría (ver `04-modulo-ventas-inventario.md`), no una restricción técnica adicional del sistema.

## Conexión directa con otros módulos

- **Todos los módulos (`03`, `04`, `05`, `06`)** dependen de este archivo para saber qué usuario puede ejecutar cada acción descrita en ellos
- **`06-modulo-pedidos-clientes.md`:** define la entidad `Empleado (Repartidor)`, que es la instancia concreta de `Usuario.tipo = Repartidor`
