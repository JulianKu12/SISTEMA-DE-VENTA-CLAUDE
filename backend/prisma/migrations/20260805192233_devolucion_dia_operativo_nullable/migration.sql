-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Devolucion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ventaId" INTEGER NOT NULL,
    "monto" REAL NOT NULL,
    "motivo" TEXT NOT NULL,
    "medioPagoOriginal" TEXT NOT NULL,
    "medioDevolucion" TEXT NOT NULL,
    "regresaAInventario" BOOLEAN NOT NULL DEFAULT false,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diaOperativoId" INTEGER,
    CONSTRAINT "Devolucion_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Devolucion_diaOperativoId_fkey" FOREIGN KEY ("diaOperativoId") REFERENCES "Dia_Operativo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Devolucion" ("diaOperativoId", "fechaHora", "id", "medioDevolucion", "medioPagoOriginal", "monto", "motivo", "regresaAInventario", "ventaId") SELECT "diaOperativoId", "fechaHora", "id", "medioDevolucion", "medioPagoOriginal", "monto", "motivo", "regresaAInventario", "ventaId" FROM "Devolucion";
DROP TABLE "Devolucion";
ALTER TABLE "new_Devolucion" RENAME TO "Devolucion";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
