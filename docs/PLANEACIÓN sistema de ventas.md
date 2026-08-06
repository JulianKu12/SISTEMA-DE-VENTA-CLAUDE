Reporte Completo de Planeación — Sistema POS para Loncherías
1. Contexto y Objetivo del Proyecto

Sistema de punto de venta (POS) enfocado en loncherías, con potencial de uso en cafeterías, pizzerías, taquerías y negocios similares de comida. El objetivo principal es generar ingresos vendiendo el software a negocios locales de la comunidad.

Validación real: El desarrollador trabaja en una lonchería, y el dueño confirmó la necesidad: actualmente todo se anota en papel, y frecuentemente se vende sin saber que los ingredientes ya se agotaron. El dueño incluso ofreció apoyo para el desarrollo.

Plazo objetivo: 15 días para una primera versión funcional (MVP reducido), reconociendo que el sistema completo tomaría 1-2 meses reales.

2. Módulos Principales (14 funciones)
Configuración de menú — ingredientes, productos con recetas, modificadores, combos
Punto de venta con inventario en tiempo real
Modificadores/especificaciones por producto
Modo offline (decidido NO implementar en la v1, ver sección 8)
Pedidos a domicilio (tipo de pedido, envío, cambio configurable)
Roles de usuario (ver sección definitiva más abajo)
Registro de empleados (solo repartidores, ver ajuste final)
Registro de clientes con referencias múltiples (landmarks, no direcciones)
Corte de caja
Gastos del día
Historial de pedidos por cliente (con archivado, no borrado)
Productos "no disponible hoy"
Pizza/producto "mitad y mitad"
Consumo interno / "No cobrar"
3. Configuración de Menú (Detalle)
Ingredientes
Nombre, unidad de medida (kg, g, ml, piezas, etc.), stock actual, alerta de stock mínimo
Al crear un ingrediente nuevo, se captura su stock inicial (cuenta como su primera entrada de inventario)
Costo de la compra (opcional) — si se captura, se refleja automáticamente como gasto del día
Productos
Nombre, precio, receta (ingredientes + cantidades)
Campo: Tipo de producto
Con receta (normal)
Reventa directa (sin receta; el producto descuenta su propio stock, ej. refresco embotellado, papas). Usa el mismo formulario de "Registrar entrada de inventario"
Campo: Permitir mitad y mitad (activable solo en productos donde aplique, ej. pizzas)
Modificadores
Tipos: Agregar (extra ingrediente + costo opcional), Quitar (no descuenta ese ingrediente), Sustituir (descuenta otro ingrediente en vez del original)
Se configuran por producto, definidos libremente por el dueño
Nota libre en el pedido para casos no anticipados (no afecta inventario, solo información para quien prepara)
Combos
Agrupan productos ya existentes con un precio especial (no tienen receta propia)
El inventario se descuenta según la receta de cada producto incluido
Los productos dentro de un combo conservan sus propios modificadores (ej. "sin cebolla" en la torta del combo)
Los modificadores no pueden alterar el precio del combo — el combo es un precio cerrado, no negociable
Mitad y mitad
Aplica a productos marcados como "permitir mitad y mitad"
Se descuenta el 50% de la receta de cada sabor elegido
Regla de redondeo: siempre hacia arriba (ej. 1.5 → 2), para evitar quedarse corto
4. Inventario (Lógica Completa)
Entrada de inventario
Función para registrar mercancía nueva (sube el stock)
Conectada automáticamente con "Gastos del día" si se captura el costo de la compra
Stock insuficiente al vender
No se bloquea la venta (Opción B elegida): se muestra una alerta, pero se permite continuar
Si el encargado decide continuar, aparece: "Usar los [cantidad disponible] y continuar" (un solo toque, sin formularios), para que el sistema descuente exactamente lo usado, no la receta completa (evita negativos falsos)
Stock negativo
Se permite (representa: compra no registrada, error de conteo, o venta consciente sin stock)
Se muestra como alerta visual para que el dueño lo revise
Se corrige automáticamente al registrar una entrada de inventario real
Existe función de "Ajuste de inventario" para corregir manualmente con motivo (conteo físico, merma/desperdicio, otro)
Desactivar ingrediente en uso
Es informativo, no bloqueante
Si un ingrediente en uso se desactiva, el sistema ofrece opciones:
"Vender esos productos sin ese ingrediente" (se quita de la receta, producto sigue activo)
"Suspender esos productos también"
"Cancelar" (no desactivar)
Combo con stock parcial (falta un producto del combo)
Se bloquea el combo completo, pero se ofrece vender lo disponible por separado
Al vender por separado, se pregunta el precio:
Precio real = suma de precios normales de los productos disponibles (sin descuento de combo)
Otro precio = el encargado/dueño captura un monto manual
Producto "no disponible" dentro de un combo
El combo se suspende automáticamente y se manda un aviso
Cambio de precio de producto dentro de un combo
Es informativo, no bloqueante
Se avisa: "Este producto es parte de: [combo]", con botones visibles de acción ("Revisar/editar precio del combo" / "Continuar sin cambios")
Consumo interno con stock insuficiente
Mismo comportamiento que una venta normal (avisa y permite usar lo disponible)
Unidad de medida
Se muestra la unidad junto al campo de captura (ej. "kg" al lado del número)
No se agrega validación adicional — se considera responsabilidad del usuario, no error del software
5. Pedidos — Lógica Completa
Tipo de pedido (se define al capturar, es lo primero del formulario)
Para recoger en sucursal
A domicilio
Origen del pedido
En mostrador (cliente presente)
Por teléfono (cliente no presente) — regla: si el cliente no está físicamente presente al capturar, siempre es "Por teléfono", sin importar qué tan rápido diga que llegará
Estado de pago (campo independiente, crítico)
Pendiente de pago
Pagado
Reglas:
En mostrador + Para recoger → normalmente se cobra al momento
Cualquier otra combinación con origen telefónico o entrega a domicilio → inicia en "Pendiente de pago"
Matriz completa de combinaciones válidas (todas se resuelven con la lógica ya construida, sin necesitar nada adicional):
En mostrador + Para recoger  → Normal, se cobra al momento
En mostrador + A domicilio   → Pendiente de pago, cobra el repartidor en la entrega
Por teléfono + Para recoger  → Pendiente de pago, cobra al llegar a recoger
Por teléfono + A domicilio   → Pendiente de pago, cobra el repartidor en la entrega
Costo de envío
Fijo, configurable solo por el Administrador
No aplica si el pedido es "Para recoger"
No se cobra si el pedido está marcado "No cobrar"
Cambio a llevar (para pagos en efectivo)
El dueño configura una lista de opciones de billetes (ej. $100, $200, $500) — no un monto fijo único
Al capturar el pedido, el encargado selecciona de esas opciones con qué billete pagará el cliente
Este campo es obligatorio, no se puede omitir — siempre debe existir cambio a llevar, incluso si el cliente dice que pagará exacto (regla de negocio explícita, sin excepciones)
Se recalcula automáticamente si el pedido se edita y el total cambia
Estados del pedido (flujo operativo)
Pendiente → En preparación → Enviado → Entregado
(+ Cancelado, disponible en cualquier momento antes de completarse)
Asignación de repartidor
Se asigna al momento de marcar "Enviado", no al capturar el pedido (para no comprometer a un repartidor que puede no estar disponible cuando el pedido esté listo)
Si solo hay 1 repartidor, el sistema lo asigna automático sin preguntar (configuración de "repartidor único")
Un mismo empleado puede fungir como repartidor puntualmente sin necesitar un rol separado
Métodos de pago (por canal)
En mostrador: Efectivo, Tarjeta, Transferencia — default: Efectivo
A domicilio: solo Efectivo y Transferencia (sin Tarjeta, porque el repartidor no carga terminal) — default: Efectivo
Si el método es Transferencia, no se muestra el campo de "cambio a llevar" (no aplica)
Comprobante de transferencia: no se verifica en el sistema (Opción A elegida), queda como responsabilidad del repartidor confirmar antes de entregar, sin ningún campo ni registro adicional
Edición de un pedido ya capturado
Se puede editar mientras esté en "Pendiente" o "En preparación" (agregar, quitar, cambiar cantidad/modificadores)
Al quitar un producto, siempre se pregunta: "¿Se puede regresar el inventario o ya se preparó/desperdició?"
Una vez "Enviado" o "Entregado", ya no se puede editar, solo cancelar
Cancelación de pedidos
Se puede cancelar en cualquier estado
Siempre se pregunta si los ingredientes se regresan al inventario o ya se usaron/perdieron (sin automatizar según el estado)
Cambio de tipo de pedido (Para recoger ↔ A domicilio) a medio proceso
Si Estado de pago = Pendiente: cambio simple, se recalcula total, se piden los datos faltantes (referencia de entrega si pasa a domicilio)
Si Estado de pago = Pagado: el sistema detiene el cambio y pregunta cómo resolver la diferencia:
Si el nuevo total es mayor: "Cobrar la diferencia ahora" (con método de pago válido para el nuevo tipo) o "El cliente ya no pagará la diferencia" (queda como cortesía/descuento)
Si el nuevo total es menor (ej. domicilio → para recoger, ya pagó envío): "Devolver el excedente" o "El cliente lo deja como cortesía"
Si el pago original fue con Tarjeta y se cambia a domicilio: el pago original con Tarjeta se mantiene tal cual (no se puede deshacer), solo la diferencia usa un método válido para domicilio (Efectivo o Transferencia)
Un pedido puede terminar con más de un método de pago asociado (el original + el de la diferencia)
Ventas o pedidos realizados con la caja cerrada
Al abrir caja, el sistema pregunta: "¿Hubo ventas antes de abrir (con la caja cerrada)?"
Si sí, se registran solo los productos vendidos (mismo flujo que una venta normal), afectando únicamente el inventario, sin pasar por el corte de caja del nuevo periodo
Pedidos "Pendientes de pago" al cerrar caja
El sistema avisa cuántos pedidos siguen pendientes de pago, mostrando cuáles son
Estos pedidos pasan al siguiente periodo sin afectar el corte actual (no bloquea el cierre)
6. Devoluciones
Aparecen como opción en el historial de cada venta ya entregada ("Registrar devolución")
No modifica el historial de la venta original (se mantiene intacto para trazabilidad)
Se genera un registro de devolución aparte, que resta el monto correspondiente del efectivo esperado en caja
Permite devolución total o parcial (monto editable)
Motivo: Producto en mal estado / Pedido incorrecto / Cliente insatisfecho / Otro
Pregunta si el producto se puede regresar al inventario (ej. un refresco cerrado sin abrir sí; una torta ya preparada no)
Pregunta el medio de devolución (mismo medio que el pago original, o "Efectivo de caja" si el medio original no aplica, ej. transferencia devuelta en efectivo)
El reporte de devoluciones muestra: Producto, Costo, Medio de pago, Medio de devolución
7. Corte de Caja
Apertura
Fondo inicial (efectivo), hora, empleado que abre
El "día operativo" se define por el ciclo abrir/cerrar caja, no por reloj/medianoche — evita problemas si el negocio cierra después de medianoche
Durante el turno
Suma automática de ventas en efectivo (mostrador + domicilio)
Ventas con Tarjeta/Transferencia se registran aparte, no cuentan como efectivo esperado en caja (son informativas)
Cierre
Fondo inicial
+ Ventas en efectivo
+ Ventas con tarjeta/transferencia (informativo, no se suma al cálculo de efectivo)
- Gastos en efectivo (incluye compras de inventario)
- Devoluciones en efectivo
= Debería haber en caja (efectivo)

Efectivo contado físicamente
Diferencia (faltante/sobrante)
Consideraciones especiales del corte
Dinero cobrado por repartidores en la calle que aún no han regresado: no se considera un problema grave, se sabe que hay un repartidor fuera y se cuadra cuando regresa
Se avisa (sin bloquear el cierre) si hay pedidos "Pendientes de pago" sin resolver — pasan al siguiente periodo
Historial de cortes
Guardado con fecha, hora, empleado, y si hubo faltante/sobrante
8. Gastos del Día
Solo el Administrador puede registrarlos (decisión basada en que normalmente el dueño trabaja presente en el negocio)
Categorías: Insumos, Servicios, Sueldos/pagos, Otro
Conectado automáticamente con Entrada de Inventario (compra de ingredientes = gasto automático)
Se refleja en el corte de caja, restando del efectivo esperado (si el gasto se pagó en efectivo)
Reporte del día
Ventas totales (cobradas)
- Gastos
- Devoluciones
= Ganancia neta
9. Consumo Interno / "No cobrar"
Checkbox simple al capturar cualquier venta: "No cobrar"
Cualquier usuario puede marcarlo (no restringido, para no frenar el flujo operativo)
Efecto:
Descuenta inventario normal (los ingredientes sí se usaron)
No suma a "Ventas del día"
No entra al corte de caja como dinero esperado
No participa en ningún cálculo de ganancia neta (ni suma ni resta) — es puramente informativo
Se oculta automáticamente el selector de método de pago cuando se marca (no aplica)
Aplica igual sin importar si el pedido es en local o a domicilio (tampoco se cobra envío)
Queda registrado en un historial visible para auditoría: producto, costo, quién lo marcó, hora — visible para que el dueño supervise el uso, sin frenar el flujo de quien lo marca
10. Historial de Pedidos por Cliente
Muestra pedidos pasados de cada cliente (fecha, productos, monto, estado)
No se sugiere el pedido anterior (decisión explícita: los clientes piden cosas diferentes cada vez, no aporta valor real)
Estrategia de almacenamiento: no se borra nunca, se archiva
Vista por default: reciente (ej. último mes) para rendimiento visual
Todo el historial completo permanece guardado en el fondo, accesible si se necesita
El peso de almacenamiento es mínimo (unos MB al año), no es un problema técnico real
11. Clientes
Registro con nombre, teléfono (opcional)
Múltiples referencias de entrega por cliente (landmarks, no direcciones — la comunidad se maneja así)
Al tomar un pedido: buscar/seleccionar cliente registrado (autocompleta nombre y referencias) o escribir nombre nuevo si no está registrado
Eliminar vs. desactivar: se desactiva (no se borra) si ya tiene historial relacionado; solo se permite eliminar de verdad si nunca se ha usado en ninguna venta/pedido
12. Roles y Usuarios (Definición Final)

Ajuste final tras discusión: 2 tipos de usuario, no 3.

Administrador/Cajero (usuario único, compartido)
Un solo login, usado por el dueño y quien esté cobrando (mismo dispositivo)
No existe función para "registrar más administradores/cajeros" — se asume que solo hay 1
Acceso completo: configuración de menú, ventas, gastos, reportes, corte de caja, activar/desactivar ingredientes/productos/clientes, marcar "No cobrar"
Consecuencia aceptada: al ser usuario compartido, el historial de auditoría no distingue si fue el dueño u otro cajero específico quien hizo una acción — el control de empleados queda como responsabilidad del dueño, no del sistema
Repartidor (múltiples, cada uno con su propio login)
Solo ve sus pedidos asignados (referencia, total, cambio a llevar — mostrado claramente por pedido si tiene varios activos, para no confundir el efectivo de cada uno)
Cambia estado a "Entregado"
Puede marcar "No cobrar"
Estados: Disponible, No disponible hoy (por falta o día libre, sin perder su registro), Inactivo (ya no trabaja ahí — no se elimina, se desactiva para no perder el historial de sus entregas pasadas)
Sesión de login persistente en el dispositivo (no requiere internet cada vez que abre la app)
Eliminar vs. desactivar (regla general para todo el sistema)
Ingredientes, productos, clientes, empleados: se desactivan, no se borran, si ya tienen historial relacionado (para no romper reportes o recetas pasadas)
Solo se permite eliminar de verdad si nunca se ha usado en ninguna transacción
13. Offline / Conectividad (Decisión Final)

Contexto real aclarado durante la planeación: el local sí cuenta con internet estable. La preocupación de conectividad aplica específicamente a los repartidores, que sí pierden señal en la calle.

Decisión para el MVP (15 días): NO construir offline-first completo.

Se descartó por razones de tiempo/complejidad para el plazo de 15 días
Se reconoce que agregarlo después no es trivial (no es "agregar una función", es cambiar cómo se guardan y sincronizan los datos desde la raíz)
Se acepta el trade-off: se construirá con arquitectura ordenada (separar bien "guardar datos" de "mostrar en pantalla") para facilitar, en lo posible, agregar offline más adelante sin rehacer todo desde cero
El caso específico del repartidor (info descargada antes de salir, estado "Entregado" sincronizado al recuperar señal) queda pendiente para una fase posterior, no para el MVP de 15 días
14. Aplicabilidad a Otros Negocios

Se confirmó que el modelo (productos configurables + ingredientes + recetas + modificadores) es fácilmente aplicable, sin rediseño, a:

Cafeterías: tamaños de bebida, tipos de leche, extras — funciona igual
Pizzerías: toppings, tamaños — funciona igual; el caso de "mitad y mitad" fue identificado como la única excepción real, y se decidió incluirlo en el diseño desde ahora (no dejarlo para después)

Esto amplía el mercado potencial de venta sin necesidad de versiones distintas del software por tipo de negocio.

15. Evaluación Estratégica del Negocio (Opinión Honesta Dada Durante la Planeación)
Calificación: 7/10 como negocio local viable; no es una innovación técnica (existen POS genéricos: Square, Clip, Loyverse, etc.)
Fortaleza real: resuelve dolores hiperespecíficos de la comunidad (cambio configurable para repartidor, referencias por landmark, modificadores con ajuste de inventario real) que sistemas genéricos no atienden
Riesgos identificados:
Construcción real toma más tiempo del esperado (1-2 meses para el sistema completo, no 15 días)
Mercado de loncherías pequeñas tiene bajo poder adquisitivo; hay que validar disposición real de pago
Venta uno-a-uno es lenta, no escala rápido
Soporte/mantenimiento es un costo de tiempo oculto
Futuro proyectado: negocio local rentable y sostenible si se ejecuta bien; no un producto de crecimiento explosivo tipo startup
Recomendación: empezar con el primer cliente ya validado, cobrar desde el inicio (aunque sea poco), construir por fases
16. Estrategia de Construcción (15 Días)

Dado el nivel de experiencia del desarrollador (1 año estudiando desarrollo con enfoque en IA), se recomendó:

Fase 1 (15 días — lo mínimo vendible):
Punto de venta + inventario básico, sin offline, resolviendo el dolor principal validado ("vender sin saber que el ingrediente ya se acabó")

Fase 2 (posterior):
Agregar offline (empezando simple), luego el resto de módulos (roles, repartidor, gastos, corte de caja, etc.)

Principio de diseño aplicado: aunque solo se construya la Fase 1 en 15 días, la base de datos se diseña pensando en las 14 funciones completas desde el inicio, aunque no todas se activen/programen de inmediato — esto evita tener que rediseñar el "esqueleto" cuando se agreguen módulos después.

17. Estado Actual

Todo el diseño de producto está cerrado. Se realizaron 8 rondas de revisión y búsqueda de errores/huecos, resolviendo progresivamente: entrada/salida de inventario, stock negativo, cancelaciones, ediciones de pedido, devoluciones, combos parciales, consumo interno, métodos de pago diferenciados, estado de pago, matriz completa de combinaciones origen/tipo de pedido, y simplificación final de roles a 2 tipos de usuario.

Pendiente: Plan técnico (elección de tecnología, diseño detallado de base de datos, y orden de construcción) — no se ha abordado todavía, es el siguiente paso natural de la conversación.

OK, y todo eso si aplica para pizzerias no, todos los puntos que aclaramos. si applica para cafeterías y demas negociós?

Evaluó la aplicabilidad de principios a otros tipos de negocios
Evaluó la aplicabilidad de principios a otros tipos de negocios

Buena pregunta para cerrar bien el reporte. Vamos a revisarlo con honestidad, punto por punto, porque no todo aplica igual a los 3 tipos de negocio.

Lo que sí aplica igual, sin ninguna diferencia (para lonchería, cafetería, pizzería y similares)
Configuración de productos, ingredientes, recetas, modificadores
Punto de venta con inventario en tiempo real
Stock insuficiente (aviso + "usar lo disponible")
Stock negativo y ajustes de inventario
Entrada de inventario / productos de reventa directa
Desactivar vs. eliminar (ingredientes, productos, clientes)
Combos (con su lógica de stock parcial, precio real, modificadores sin costo)
Corte de caja, gastos del día, consumo interno/"No cobrar"
Roles (Administrador/Cajero + Repartidor)
Devoluciones
Historial de clientes con archivado
Métodos de pago (mostrador vs. domicilio)
Apertura/cierre de caja como "día operativo"

Todo esto es genérico al problema de "negocio con recetas e inventario", no depende de qué comida vendas.

Lo que aplica distinto o parcialmente, según el negocio

Pedidos a domicilio + repartidor + referencias por landmark

Una cafetería típica no reparte (aunque puede tener "para llevar", que es más simple, sin repartidor asignado)
Una pizzería sí suele repartir, así que esto le aplica igual que a la lonchería
Las referencias por landmark (en vez de dirección) son específicas de tu comunidad/pueblo — si vendes esto en zona urbana con direcciones normales, ese detalle en particular no aportaría, aunque el resto del módulo de domicilio sigue sirviendo

Mitad y mitad

Es específico de pizzería (o productos similares que se puedan "dividir", como algunas ensaladas o platillos combinables)
No aplica a lonchería ni cafetería, simplemente no se activa esa opción en sus productos

Cambio a llevar configurable / opciones de billetes

Solo relevante si el negocio hace entregas a domicilio con cobro en efectivo. Una cafetería sin reparto no lo necesitaría
Conclusión honesta

El núcleo del sistema (80-90% de lo que diseñamos) es genérico y sirve igual para cualquier negocio de comida con recetas configurables. Las excepciones son módulos específicos que simplemente no se activan si el negocio no los necesita (ej. una cafetería sin reparto no usa el módulo de domicilio, pero el sistema no se rompe por no usarlo, solo queda inactivo).

Esto confirma lo que ya habíamos concluido antes: no construiste un sistema "solo para loncherías", construiste una base flexible que sirve a varios tipos de negocio de comida, activando o desactivando módulos según lo que cada dueño necesite.