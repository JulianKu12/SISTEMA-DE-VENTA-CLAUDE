import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { PrismaClient } from '@prisma/client'
import prisma from '../src/models/prisma.js'
import {
  crearRespaldoSQLite,
  reemplazarBaseSQLite,
  verificarRespaldoSQLite,
} from '../src/utils/sqliteBackup.js'
import { iniciarRespaldosAutomaticos } from '../src/utils/sqliteBackupScheduler.js'
import { prismaUrlForSqliteFile, resolveDatabasePath } from '../src/utils/sqliteFiles.js'

function crearCliente(filePath) {
  return new PrismaClient({
    datasources: { db: { url: prismaUrlForSqliteFile(filePath) } },
  })
}

test('respalda, verifica y restaura SQLite conservando el estado previo como otro archivo', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-backup-test-'))
  const sourcePath = resolveDatabasePath()
  const targetPath = path.join(directory, 'restore-target.db')
  let targetClient

  try {
    const usuariosAntes = await prisma.usuario.count()
    const backupPath = await crearRespaldoSQLite({
      prismaClient: prisma,
      databasePath: sourcePath,
      backupDirectory: directory,
    })
    assert.equal(await verificarRespaldoSQLite(backupPath), backupPath)

    const segundoBackup = await crearRespaldoSQLite({
      prismaClient: prisma,
      databasePath: sourcePath,
      backupDirectory: directory,
    })
    assert.notEqual(segundoBackup, backupPath)
    assert.equal((await fs.stat(backupPath)).isFile(), true)
    assert.equal((await fs.stat(segundoBackup)).isFile(), true)

    let errorAutomatico
    const detenerRespaldos = iniciarRespaldosAutomaticos({
      prismaClient: prisma,
      databasePath: sourcePath,
      backupDirectory: directory,
      intervalHours: 24,
      logger: {
        info() {},
        error(_message, error) {
          errorAutomatico = error
        },
      },
    })
    await detenerRespaldos()
    assert.equal(errorAutomatico, undefined)

    await fs.copyFile(sourcePath, targetPath)
    targetClient = crearCliente(targetPath)
    const marker = `solo-en-target-${Date.now()}`
    await targetClient.usuario.create({
      data: {
        usuario: marker,
        contraseña: 'hash-no-utilizado',
        tipo: 'Administrador',
      },
    })
    assert.equal(await targetClient.usuario.count(), usuariosAntes + 1)
    await targetClient.$disconnect()
    targetClient = null

    await reemplazarBaseSQLite({ databasePath: targetPath, backupPath })
    targetClient = crearCliente(targetPath)
    assert.equal(await targetClient.usuario.count(), usuariosAntes)
    assert.equal(await targetClient.usuario.findUnique({ where: { usuario: marker } }), null)

    const archivos = await fs.readdir(directory)
    assert.equal(
      archivos.filter((name) => name.startsWith('pos-') && name.endsWith('.db')).length,
      3,
    )
  } finally {
    if (targetClient) await targetClient.$disconnect()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
