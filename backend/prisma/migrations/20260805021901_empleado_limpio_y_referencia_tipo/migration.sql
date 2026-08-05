/*
  Warnings:

  - You are about to drop the column `contraseña` on the `Empleado` table. All the data in the column will be lost.
  - You are about to drop the column `tipo` on the `Empleado` table. All the data in the column will be lost.
  - You are about to drop the column `usuario` on the `Empleado` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Movimiento_Inventario" ADD COLUMN "referenciaTipo" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Empleado" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "estadoDisponibilidad" TEXT NOT NULL DEFAULT 'Disponible',
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Empleado" ("estadoDisponibilidad", "fechaCreacion", "id", "nombre", "usuarioId") SELECT "estadoDisponibilidad", "fechaCreacion", "id", "nombre", "usuarioId" FROM "Empleado";
DROP TABLE "Empleado";
ALTER TABLE "new_Empleado" RENAME TO "Empleado";
CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
