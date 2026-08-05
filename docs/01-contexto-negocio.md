# 01 — Contexto y Objetivo del Proyecto

> Ver `00-INDICE.md` para el mapa completo de cómo este documento se conecta con los demás.

## Qué es el proyecto

Sistema de punto de venta (POS) enfocado en **loncherías**, con potencial de uso en cafeterías, pizzerías, taquerías y negocios similares de comida. El objetivo principal es generar ingresos vendiendo el software a negocios locales de la comunidad.

## Validación real

El desarrollador trabaja en una lonchería, y el dueño confirmó la necesidad: actualmente todo se anota en papel, y frecuentemente se vende sin saber que los ingredientes ya se agotaron. El dueño ofreció apoyo para el desarrollo.

**Este es el dolor #1 que el sistema debe resolver primero:** ver `04-modulo-ventas-inventario.md`, sección "Lógica: Venta con stock insuficiente".

## Plazo objetivo

15 días para una primera versión funcional (MVP reducido — Fase 2 completa de `08-lista-tareas.md`), reconociendo que el sistema completo tomaría 1-2 meses reales.

## Perfil del desarrollador

Estudiante con 1 año de experiencia en desarrollo de software, con enfoque en desarrollo asistido por IA. Usará **OpenCode** (asistente de IA en consola) como herramienta principal para escribir el código, a partir de prompts basados en estos documentos.

## Evaluación estratégica del negocio (honesta)

- **Calificación:** 7/10 como negocio local viable; no es una innovación técnica (existen POS genéricos: Square, Clip, Loyverse, etc.)
- **Fortaleza real:** resuelve dolores hiperespecíficos de la comunidad que sistemas genéricos no atienden:
  - Cambio configurable para repartidor (ver `06-modulo-pedidos-clientes.md`)
  - Referencias por landmark en vez de dirección (ver `06-modulo-pedidos-clientes.md`)
  - Modificadores con ajuste de inventario real (ver `03-modulo-productos.md` y `04-modulo-ventas-inventario.md`)
- **Riesgos identificados:** construcción real toma más tiempo del esperado; mercado de loncherías pequeñas tiene bajo poder adquisitivo; venta uno-a-uno es lenta; soporte/mantenimiento es un costo de tiempo oculto
- **Futuro proyectado:** negocio local rentable y sostenible si se ejecuta bien; no un producto de crecimiento explosivo tipo startup

## Aplicabilidad a otros tipos de negocio

El núcleo del sistema (productos configurables + ingredientes + recetas + modificadores, definido en `03-modulo-productos.md`) sirve **sin cambios de desarrollo** a cafeterías y pizzerías:

- **Cafeterías:** tamaños de bebida, tipos de leche, extras — se configuran como Modificadores normales (ver `03-modulo-productos.md`)
- **Pizzerías:** toppings y tamaños funcionan igual; la única función específica es "mitad y mitad" (`Producto.permite_mitad_y_mitad`, ver `03-modulo-productos.md`), ya incluida en el diseño desde el inicio
- Las referencias tipo landmark (`Cliente_Referencia`, ver `06-modulo-pedidos-clientes.md`) son específicas del contexto del desarrollador (poblado sin direcciones formales), pero el campo es texto libre y funciona igual con direcciones tradicionales — no requiere ningún cambio de esquema para venderse en zona urbana

## Decisión sobre modo offline

El local del negocio **sí cuenta con internet estable**. La necesidad de "modo offline" aplica específicamente al **repartidor**, que pierde señal en la calle (ver `06-modulo-pedidos-clientes.md`, entidad Empleado/Repartidor).

Se decidió **NO construir offline-first en el MVP** (por tiempo/complejidad en 15 días), dejándolo como fase futura — ver `08-lista-tareas.md`, Fase 12. Se buscará mantener una arquitectura ordenada (separación clara entre lógica de datos y presentación, ver `02-stack-tecnico.md`) para facilitar agregarlo después sin rediseño completo.
