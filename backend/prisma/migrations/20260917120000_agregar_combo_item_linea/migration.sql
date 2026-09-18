-- Corrige el cobro de pedidos con el MISMO combo repetido con configuración
-- distinta (notas/modificadores): agrupa las filas expandidas de un combo por
-- "línea" (comboItemLinea) en vez de solo por comboId.
ALTER TABLE "Pedido_Producto" ADD COLUMN "comboItemLinea" INTEGER;