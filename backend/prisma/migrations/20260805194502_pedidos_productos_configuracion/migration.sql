-- CreateTable
CREATE TABLE "Pedido_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioCongelado" REAL NOT NULL,
    "esMitadYMitad" BOOLEAN NOT NULL DEFAULT false,
    "comboId" INTEGER,
    CONSTRAINT "Pedido_Producto_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_Producto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_Producto_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido_Producto_Mitad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoProductoId" INTEGER NOT NULL,
    "sabor1ProductoId" INTEGER NOT NULL,
    "sabor2ProductoId" INTEGER NOT NULL,
    CONSTRAINT "Pedido_Producto_Mitad_pedidoProductoId_fkey" FOREIGN KEY ("pedidoProductoId") REFERENCES "Pedido_Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_Producto_Mitad_sabor1ProductoId_fkey" FOREIGN KEY ("sabor1ProductoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_Producto_Mitad_sabor2ProductoId_fkey" FOREIGN KEY ("sabor2ProductoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido_Producto_Modificador" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pedidoProductoId" INTEGER NOT NULL,
    "modificadorId" INTEGER NOT NULL,
    "costoAplicado" REAL NOT NULL,
    CONSTRAINT "Pedido_Producto_Modificador_pedidoProductoId_fkey" FOREIGN KEY ("pedidoProductoId") REFERENCES "Pedido_Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Pedido_Producto_Modificador_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "Modificador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "costoEnvio" REAL NOT NULL DEFAULT 0,
    "repartidorUnico" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_Producto_Mitad_pedidoProductoId_key" ON "Pedido_Producto_Mitad"("pedidoProductoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_Producto_Modificador_pedidoProductoId_modificadorId_key" ON "Pedido_Producto_Modificador"("pedidoProductoId", "modificadorId");
