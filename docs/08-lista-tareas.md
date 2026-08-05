# 08 — Lista de Tareas (Roadmap Completo)

> Ver `00-INDICE.md` para el mapa completo. Cada tarea indica entre paréntesis qué archivo de módulo contiene la lógica de negocio detallada que se debe implementar — **consulta siempre ese archivo antes de generar el prompt correspondiente**, no implementes solo a partir del nombre de la tarea.

## FASE 0: Diseño
- [ ] Diseñar wireframes de cada pantalla (en Canva, por cuenta del desarrollador)
- [ ] Definir estilo visual básico (colores, tipografía, tamaño de botones táctiles — ver `02-stack-tecnico.md`)
- [ ] Diseñar el flujo de navegación entre pantallas
- [x] Diseñar el diagrama completo de base de datos (cubierto en `03`, `04`, `05`, `06`, `07`)
- [x] Definir el stack tecnológico (`02-stack-tecnico.md`)

## FASE 1: Preparación técnica
- [x] Instalar herramientas de desarrollo (Node.js, Git, VS Code)
- [x] Crear repositorio Git y conectarlo con GitHub
- [ ] Crear estructura de carpetas del proyecto (frontend/backend) — ver `02-stack-tecnico.md`, "Instrucción para el primer prompt de OpenCode"
- [ ] Configurar la base de datos local (Prisma + SQLite, schema basado en `03`, `04`, `05`, `06`, `07`)

## FASE 2: Núcleo del sistema (meta: 15 días — MVP vendible)

### Ingredientes (lógica en `03-modulo-productos.md`)
- [ ] Crear tabla de ingredientes (nombre, unidad, stock, alerta mínima)
- [ ] Pantalla: crear ingrediente con stock inicial y costo opcional (costo conecta con `05-modulo-caja-gastos.md`)
- [ ] Pantalla: listar/editar ingredientes
- [ ] Función: desactivar ingrediente — avisa qué productos lo usan (consulta `Producto_Ingrediente`), con opciones (vender sin él / suspender producto)
- [ ] Función: eliminar ingrediente — solo si nunca se ha usado (verificar contra `Movimiento_Inventario` en `04-modulo-ventas-inventario.md`)

### Productos (lógica en `03-modulo-productos.md`)
- [ ] Crear tabla de productos
- [ ] Campo "tipo de producto": con receta / reventa directa
- [ ] Pantalla: crear producto (nombre, precio, receta con cantidades) — mostrar unidad de medida del ingrediente junto al campo de cantidad
- [ ] Campo: "permitir mitad y mitad"
- [ ] Función: editar producto
- [ ] Función: marcar "no disponible hoy" y desactivación permanente (verificar impacto en `Combo`, ver `03-modulo-productos.md`)

### Modificadores (lógica en `03-modulo-productos.md`)
- [ ] Crear tabla de modificadores
- [ ] Tipos: agregar / quitar / sustituir
- [ ] Asociar modificadores a productos, con costo opcional

### Punto de venta (lógica en `04-modulo-ventas-inventario.md`, consume entidades de `03-modulo-productos.md`)
- [ ] Pantalla principal con grid de productos (botones grandes, táctiles — ver `02-stack-tecnico.md`)
- [ ] Selección de producto + aplicar modificadores
- [ ] Cálculo automático del total
- [ ] Checkbox "No cobrar"
- [ ] Confirmar venta
- [ ] Congelar precio de venta por transacción (`Venta_Producto.precio_congelado`)

### Inventario en tiempo real (lógica en `04-modulo-ventas-inventario.md`)
- [ ] Descuento automático de ingredientes según receta
- [ ] Alerta de stock insuficiente + botón "Usar lo disponible y continuar"
- [ ] Redondeo hacia arriba para mitad y mitad

### Entrada de inventario (lógica en `04-modulo-ventas-inventario.md`, conecta con `05-modulo-caja-gastos.md`)
- [ ] Pantalla "Registrar entrada de inventario"
- [ ] Conexión automática con gastos si se captura costo

### Consumo interno (lógica en `04-modulo-ventas-inventario.md`, permisos en `07-modulo-roles.md`)
- [ ] Registro de auditoría de "No cobrar" (quién, qué, cuándo)
- [ ] Reporte informativo (sin afectar cálculos)

*Completar hasta aquí = MVP vendible.*

## FASE 3: Operación diaria completa

### Caja (lógica en `05-modulo-caja-gastos.md`, depende de `04-modulo-ventas-inventario.md`)
- [ ] Función "Abrir caja" (fondo inicial)
- [ ] Función "Cerrar caja" (calcula diferencia — fórmula exacta en `05-modulo-caja-gastos.md`)
- [ ] Historial de cortes
- [ ] Aviso de pedidos pendientes de pago al cerrar (no bloquea) — consulta `06-modulo-pedidos-clientes.md`
- [ ] Función "Registrar ventas previas a apertura"

### Gastos (lógica en `05-modulo-caja-gastos.md`)
- [ ] Pantalla "Registrar gasto" — solo Administrador (ver `07-modulo-roles.md`)
- [ ] Reflejo automático en corte de caja

### Métodos de pago (lógica en `04-modulo-ventas-inventario.md` y `06-modulo-pedidos-clientes.md`)
- [ ] Selector Efectivo/Tarjeta/Transferencia (default Efectivo)
- [ ] Separación en corte de caja (efectivo cuenta, tarjeta/transferencia informativo)

### Cancelaciones y ediciones (lógica en `06-modulo-pedidos-clientes.md`, genera movimientos en `04-modulo-ventas-inventario.md`)
- [ ] Función "Cancelar pedido" con pregunta de inventario
- [ ] Función "Editar pedido"
- [ ] Preguntar inventario al quitar producto

### Devoluciones (lógica en `05-modulo-caja-gastos.md`, genera movimientos en `04-modulo-ventas-inventario.md`)
- [ ] Botón "Registrar devolución"
- [ ] Captura de monto y motivo
- [ ] Pregunta si regresa a inventario
- [ ] Pregunta medio de devolución
- [ ] Reporte de devoluciones (producto, costo, medio de pago, medio de devolución)

### Ajustes de inventario (lógica en `04-modulo-ventas-inventario.md`)
- [ ] Pantalla "Ajuste de inventario" con motivo

## FASE 4: Combos y variantes (lógica en `03-modulo-productos.md`, ejecución en `04-modulo-ventas-inventario.md`)
- [ ] Modelo de combos (productos + precio especial)
- [ ] Mostrar combos en punto de venta
- [ ] Descontar inventario según productos del combo
- [ ] Combo con stock parcial (bloquear + vender disponible con precio real u otro)
- [ ] Combo se suspende si un producto no está disponible
- [ ] Aviso al cambiar precio de producto en combo
- [ ] Función "mitad y mitad"

## FASE 5: Domicilio y repartidor (lógica en `06-modulo-pedidos-clientes.md`)

### Clientes
- [ ] Tabla de clientes (nombre, teléfono)
- [ ] Múltiples referencias de entrega
- [ ] Buscar/seleccionar cliente al capturar pedido
- [ ] Desactivar/eliminar cliente

### Pedidos a domicilio
- [ ] Campo "Tipo de pedido" (para recoger / domicilio)
- [ ] Campo "Origen" (mostrador / teléfono)
- [ ] Campo "Estado de pago" (pendiente / pagado) — dispara generación de `Venta`, ver `04-modulo-ventas-inventario.md`
- [ ] Configuración de costo de envío fijo
- [ ] Configuración de opciones de cambio a llevar
- [ ] Selector obligatorio "cliente paga con" + cálculo de cambio
- [ ] Recalcular cambio al editar pedido
- [ ] Restringir métodos de pago en domicilio (sin Tarjeta)
- [ ] Ajustar "No cobrar" para pedidos a domicilio — ocultar costo de envío y selector de cambio a llevar

### Repartidor (permisos en `07-modulo-roles.md`)
- [ ] Rol "Repartidor" con login individual
- [ ] Pantalla de alta de repartidor (nombre, usuario, contraseña, estado inicial)
- [ ] Sesión persistente en dispositivo
- [ ] Pantalla de pedidos asignados
- [ ] Estados del pedido (Pendiente → Preparación → Enviado → Entregado)
- [ ] Asignación de repartidor al marcar "Enviado"
- [ ] Configuración "repartidor único"
- [ ] Estados del repartidor (Disponible / No disponible hoy / Inactivo)

## FASE 6: Reportes finales (datos de `04`, `05`, `06`)
- [ ] Historial de pedidos por cliente (vista reciente por default, archivo completo en el fondo)
- [ ] Reporte de "No cobrar"
- [ ] Reporte de ventas del día (ventas, gastos, devoluciones, ganancia neta)
- [ ] Historial completo de cortes de caja

## FASE 7: Pruebas (Testing)
- [ ] Probar cada módulo por separado (usar como checklist las reglas de negocio de `03` a `07`)
- [ ] Probar flujos completos de principio a fin
- [ ] Probar casos límite (stock en cero, cancelaciones, devoluciones, combos incompletos — todos documentados en sus respectivos módulos)
- [ ] Corregir errores encontrados
- [ ] Pruebas con datos reales en el negocio (en paralelo al papel)
- [ ] Ajustar según feedback real del dueño y empleados

## FASE 8: Empaquetado y distribución
- [ ] Compilar/construir la versión final
- [ ] Crear ícono y splash screen (PWA)
- [ ] Configurar manifest de PWA para instalación en tablet
- [ ] Probar la instalación en un dispositivo limpio
- [ ] Configurar actualizaciones futuras
- [ ] Respaldo de la base de datos (estrategia de backup)

## FASE 9: Documentación y capacitación
- [ ] Manual del Administrador
- [ ] Guía rápida del Repartidor
- [ ] Capacitar al dueño y empleados en persona

## FASE 10: Lanzamiento y venta
- [ ] Instalar y poner en marcha en el negocio de prueba
- [ ] Periodo de acompañamiento cercano
- [ ] Ajustes finales según uso real
- [ ] Preparar material de venta (capturas, video demo, precios)
- [ ] Definir modelo de cobro (suscripción vs. pago único)
- [ ] Buscar el segundo cliente (ver aplicabilidad a otros negocios en `01-contexto-negocio.md`)

## FASE 11: Soporte y mantenimiento continuo
- [ ] Definir canal de soporte
- [ ] Plan de corrección de errores
- [ ] Plan de nuevas funciones

## FASE 12: Offline para repartidor (mejora posterior, NO parte del MVP — ver `01-contexto-negocio.md`)
- [ ] Diseñar almacenamiento local en el celular del repartidor (guardar pedido asignado antes de salir)
- [ ] Sincronización automática cuando recupera señal (wifi o datos)
- [ ] Manejo de "Entregado" marcado sin señal, sincronizado después

---

## Estado actual del proyecto

- ✅ Toda la planeación de negocio y lógica de producto: cerrada (8 rondas de revisión de errores/casos especiales)
- ✅ Stack tecnológico definido (`02-stack-tecnico.md`)
- ✅ Repositorio Git creado y conectado a GitHub (`https://github.com/JulianKu12/Sistema-de-ventas`), primer commit subido
- ✅ Entorno de desarrollo local configurado (proyecto fuera de OneDrive para evitar conflictos)
- ⏳ **Siguiente paso inmediato:** Crear estructura base del proyecto (Fase 1) usando el prompt descrito en `02-stack-tecnico.md`
