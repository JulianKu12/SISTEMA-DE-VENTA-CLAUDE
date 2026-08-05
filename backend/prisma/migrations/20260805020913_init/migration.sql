-- CreateTable
CREATE TABLE "Ingrediente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "unidadMedida" TEXT NOT NULL,
    "stockActual" REAL NOT NULL,
    "stockMinimoAlerta" REAL NOT NULL,
    "costoUltimaCompra" REAL,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "precio" REAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "permiteMitadYMitad" BOOLEAN NOT NULL DEFAULT false,
    "disponibleHoy" BOOLEAN NOT NULL DEFAULT true,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Producto_Ingrediente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "ingredienteId" INTEGER NOT NULL,
    "cantidad" REAL NOT NULL,
    CONSTRAINT "Producto_Ingrediente_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Producto_Ingrediente_ingredienteId_fkey" FOREIGN KEY ("ingredienteId") REFERENCES "Ingrediente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Modificador" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ingredienteAfectadoId" INTEGER NOT NULL,
    "ingredienteSustitutoId" INTEGER,
    "cantidadExtra" REAL,
    "costoAdicional" REAL NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    CONSTRAINT "Modificador_ingredienteAfectadoId_fkey" FOREIGN KEY ("ingredienteAfectadoId") REFERENCES "Ingrediente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Modificador_ingredienteSustitutoId_fkey" FOREIGN KEY ("ingredienteSustitutoId") REFERENCES "Ingrediente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Producto_Modificador" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productoId" INTEGER NOT NULL,
    "modificadorId" INTEGER NOT NULL,
    CONSTRAINT "Producto_Modificador_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Producto_Modificador_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "Modificador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Combo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "precioEspecial" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Activo'
);

-- CreateTable
CREATE TABLE "Combo_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "comboId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Combo_Producto_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Combo_Producto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pedidoId" INTEGER,
    "total" REAL NOT NULL,
    "metodoPago" TEXT NOT NULL DEFAULT 'Efectivo',
    "noCobrar" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" INTEGER NOT NULL,
    "diaOperativoId" INTEGER NOT NULL,
    "esVentaPreviaApertura" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Venta_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Venta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_diaOperativoId_fkey" FOREIGN KEY ("diaOperativoId") REFERENCES "Dia_Operativo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Venta_Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ventaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioCongelado" REAL NOT NULL,
    "esMitadYMitad" BOOLEAN NOT NULL DEFAULT false,
    "comboId" INTEGER,
    CONSTRAINT "Venta_Producto_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_Producto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_Producto_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Venta_Producto_Mitad" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ventaProductoId" INTEGER NOT NULL,
    "sabor1ProductoId" INTEGER NOT NULL,
    "sabor2ProductoId" INTEGER NOT NULL,
    CONSTRAINT "Venta_Producto_Mitad_ventaProductoId_fkey" FOREIGN KEY ("ventaProductoId") REFERENCES "Venta_Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_Producto_Mitad_sabor1ProductoId_fkey" FOREIGN KEY ("sabor1ProductoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_Producto_Mitad_sabor2ProductoId_fkey" FOREIGN KEY ("sabor2ProductoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Venta_Producto_Modificador" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ventaProductoId" INTEGER NOT NULL,
    "modificadorId" INTEGER NOT NULL,
    "costoAplicado" REAL NOT NULL,
    CONSTRAINT "Venta_Producto_Modificador_ventaProductoId_fkey" FOREIGN KEY ("ventaProductoId") REFERENCES "Venta_Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Venta_Producto_Modificador_modificadorId_fkey" FOREIGN KEY ("modificadorId") REFERENCES "Modificador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movimiento_Inventario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ingredienteId" INTEGER,
    "productoId" INTEGER,
    "tipoMovimiento" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "motivo" TEXT,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenciaId" INTEGER,
    CONSTRAINT "Movimiento_Inventario_ingredienteId_fkey" FOREIGN KEY ("ingredienteId") REFERENCES "Ingrediente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Movimiento_Inventario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dia_Operativo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fechaApertura" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaCierre" DATETIME,
    "fondoInicial" REAL NOT NULL,
    "efectivoContado" REAL,
    "estado" TEXT NOT NULL DEFAULT 'Abierto',
    "usuarioId" INTEGER NOT NULL,
    CONSTRAINT "Dia_Operativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "concepto" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "categoria" TEXT NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diaOperativoId" INTEGER,
    "origen" TEXT NOT NULL DEFAULT 'Manual',
    "usuarioId" INTEGER NOT NULL,
    CONSTRAINT "Gasto_diaOperativoId_fkey" FOREIGN KEY ("diaOperativoId") REFERENCES "Dia_Operativo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Gasto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Devolucion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ventaId" INTEGER NOT NULL,
    "monto" REAL NOT NULL,
    "motivo" TEXT NOT NULL,
    "medioPagoOriginal" TEXT NOT NULL,
    "medioDevolucion" TEXT NOT NULL,
    "regresaAInventario" BOOLEAN NOT NULL DEFAULT false,
    "fechaHora" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diaOperativoId" INTEGER NOT NULL,
    CONSTRAINT "Devolucion_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Devolucion_diaOperativoId_fkey" FOREIGN KEY ("diaOperativoId") REFERENCES "Dia_Operativo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Cliente_Referencia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clienteId" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    CONSTRAINT "Cliente_Referencia_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "contraseña" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Repartidor',
    "estadoDisponibilidad" TEXT NOT NULL DEFAULT 'Disponible',
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "estadoPreparacion" TEXT NOT NULL DEFAULT 'Pendiente',
    "estadoPago" TEXT NOT NULL DEFAULT 'Pendiente_pago',
    "clienteId" INTEGER,
    "nombreClienteLibre" TEXT,
    "referenciaId" INTEGER,
    "costoEnvio" REAL,
    "repartidorId" INTEGER,
    "metodoPago" TEXT NOT NULL DEFAULT 'Efectivo',
    "montoReferenciaPago" REAL,
    "cambioALlevar" REAL,
    "noCobrar" BOOLEAN NOT NULL DEFAULT false,
    "total" REAL NOT NULL,
    "fechaHoraCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ventaId" INTEGER,
    CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pedido_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "Cliente_Referencia" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pedido_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Empleado" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pedido_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT,
    "usuario" TEXT NOT NULL,
    "contraseña" TEXT NOT NULL,
    "tokenSesion" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Producto_Ingrediente_productoId_ingredienteId_key" ON "Producto_Ingrediente"("productoId", "ingredienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_Modificador_productoId_modificadorId_key" ON "Producto_Modificador"("productoId", "modificadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Combo_Producto_comboId_productoId_key" ON "Combo_Producto"("comboId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_pedidoId_key" ON "Venta"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_Producto_Mitad_ventaProductoId_key" ON "Venta_Producto_Mitad"("ventaProductoId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_Producto_Modificador_ventaProductoId_modificadorId_key" ON "Venta_Producto_Modificador"("ventaProductoId", "modificadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_usuario_key" ON "Empleado"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_ventaId_key" ON "Pedido"("ventaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_usuario_key" ON "Usuario"("usuario");
