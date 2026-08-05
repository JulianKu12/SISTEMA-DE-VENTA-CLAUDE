-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Configuracion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "costoEnvio" REAL NOT NULL DEFAULT 0,
    "repartidorUnico" BOOLEAN NOT NULL DEFAULT false,
    "opcionesCambio" JSONB NOT NULL DEFAULT [50, 100, 200, 500]
);
INSERT INTO "new_Configuracion" ("costoEnvio", "id", "repartidorUnico") SELECT "costoEnvio", "id", "repartidorUnico" FROM "Configuracion";
DROP TABLE "Configuracion";
ALTER TABLE "new_Configuracion" RENAME TO "Configuracion";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
