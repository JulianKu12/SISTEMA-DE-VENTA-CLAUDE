-- AlterTable
ALTER TABLE "Pedido_Producto" ADD COLUMN "comboPrecioCongelado" REAL;

-- AlterTable
ALTER TABLE "Venta_Producto" ADD COLUMN "comboPrecioCongelado" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Movimiento_Inventario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ingredienteId" INTEGER,
    "productoId" INTEGER,
    "tipoMovimiento" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "motivo" TEXT,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenciaId" INTEGER,
    "referenciaTipo" TEXT,
    "ventaProductoId" INTEGER,
    "pedidoProductoId" INTEGER,
    CONSTRAINT "Movimiento_Inventario_ingredienteId_fkey" FOREIGN KEY ("ingredienteId") REFERENCES "Ingrediente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimiento_Inventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimiento_Inventario_ventaProductoId_fkey" FOREIGN KEY ("ventaProductoId") REFERENCES "Venta_Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimiento_Inventario_pedidoProductoId_fkey" FOREIGN KEY ("pedidoProductoId") REFERENCES "Pedido_Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Movimiento_Inventario" ("cantidad", "fechaHora", "id", "ingredienteId", "motivo", "productoId", "referenciaId", "referenciaTipo", "tipoMovimiento") SELECT "cantidad", "fechaHora", "id", "ingredienteId", "motivo", "productoId", "referenciaId", "referenciaTipo", "tipoMovimiento" FROM "Movimiento_Inventario";
DROP TABLE "Movimiento_Inventario";
ALTER TABLE "new_Movimiento_Inventario" RENAME TO "Movimiento_Inventario";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
