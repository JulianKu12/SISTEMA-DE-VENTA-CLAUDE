-- CreateTable
CREATE TABLE "IngresoManual" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monto" REAL NOT NULL,
    "metodoPago" TEXT NOT NULL DEFAULT 'Efectivo',
    "motivo" TEXT NOT NULL,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diaOperativoId" INTEGER,
    "usuarioId" INTEGER NOT NULL,
    CONSTRAINT "IngresoManual_diaOperativoId_fkey" FOREIGN KEY ("diaOperativoId") REFERENCES "Dia_Operativo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IngresoManual_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
