// -----------------------------------------------------------------------------
// Tests del parser de Booksy .xlsx.
//
// Los fixtures se construyen aquí, en código: NO se commitea ningún .xlsx.
// Los exports reales de Booksy traen teléfonos y emails de clientes de verdad
// y no tienen sitio en el repo.
//
// La mitad pura (`parseBooksyGrid`) se prueba con matrices literales que
// replican la forma real del export: 6-7 filas de preámbulo, la tabla
// desplazada a la derecha, y una fila "Total" al final.
//
// La mitad impura (`parseBooksyWorkbook`) se prueba de verdad: se genera un
// xlsx con exceljs, se cifra con officecrypto-tool y se vuelve a leer. Es el
// camino exacto que recorre el fichero que manda Booksy.
// -----------------------------------------------------------------------------

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseBooksyGrid,
  parseBooksyWorkbook,
  findHeaderRow,
  looksCompoundFile,
  type SheetGrid,
} from './booksy-xlsx.ts'

const PASSWORD = 'booksy-test-2026'

/**
 * Export "Clientes → exportar": el bueno, el que trae teléfonos. Preámbulo
 * de 5 filas y tabla arrancando en la columna 2, como el real.
 */
function clientesGrid(): SheetGrid {
  return [
    [],
    [null, 'Lista de clientes'],
    [null, 'Private Studio, Carrer de Muntaner, 172, 08036, Barcelona'],
    [null, 'Período de 18/1/24 a 22/5/26'],
    [],
    [null, null, 'Nombre', 'Apellido', 'Teléfono móvil', 'Correo electrónico', 'Notas'],
    [null, null, 'Marc', 'Puig', '644 28 86 63', '  MARC@Example.COM ', 'Fade + barba'],
    [null, null, 'Laia', '', '0034611223344', 'no-es-un-email', ''],
    [null, null, 'Jordi', 'Serra', '+44 7911 123456', '', null],
  ]
}

/**
 * Export "Informes → Lista de clientes": el informe de facturación. Misma
 * pinta, pero SIN columna de teléfono — inservible para importar.
 */
function informeGrid(): SheetGrid {
  return [
    [],
    [null, 'Lista de clientes'],
    [null, 'Período de 18/1/24 a 22/5/26'],
    [],
    [
      null, null, null, 'Nombre y apellido', 'Grupos', 'Número de reservas',
      'Número de ausencias', 'Primera visita', 'Ingresos totales',
    ],
    [null, null, '1', 'Marc Puig', 'Clientes poco frecuentes', 4, 0, '2/11/24', 80],
  ]
}

describe('findHeaderRow', () => {
  test('salta el preámbulo y localiza la fila de cabeceras', () => {
    const header = findHeaderRow(clientesGrid())
    assert.ok(header)
    assert.equal(header.index, 5)
    assert.deepEqual(header.columns, { name: 2, last: 3, phone: 4, email: 5, notes: 6 })
  })

  test('tolera tildes, mayúsculas y sufijos en las cabeceras', () => {
    const header = findHeaderRow([['NOMBRE COMPLETO', 'Teléfono Móvil', 'E-Mail']])
    assert.ok(header)
    assert.deepEqual(header.columns, { name: 0, phone: 1, email: 2 })
  })

  test('devuelve null si no hay nada que parezca una tabla de clientes', () => {
    assert.equal(findHeaderRow([['a', 'b'], [1, 2]]), null)
  })
})

describe('parseBooksyGrid', () => {
  test('extrae las filas del export bueno', () => {
    const res = parseBooksyGrid(clientesGrid())
    assert.ok(res.ok)
    assert.equal(res.headerRowIndex, 5)
    assert.deepEqual(res.rows, [
      { name: 'Marc Puig', phone: '+34644288663', email: 'marc@example.com', notas: 'Fade + barba' },
      { name: 'Laia', phone: '+34611223344', email: null, notas: null },
      { name: 'Jordi Serra', phone: '+447911123456', email: null, notas: null },
    ])
    assert.equal(res.stats.scanned, 3)
    assert.equal(res.stats.withName, 3)
    assert.equal(res.stats.withEmail, 1)
    assert.equal(res.headerLabels.phone, 'Teléfono móvil')
  })

  test('el informe sin teléfonos falla con no_phone_column, no con 0 filas', () => {
    const res = parseBooksyGrid(informeGrid())
    assert.equal(res.ok, false)
    assert.equal(res.code, 'no_phone_column')
  })

  test('descarta la fila Total del pie del informe', () => {
    const grid = clientesGrid()
    grid.push([null, null, 'Total', '', '', '', ''])
    const res = parseBooksyGrid(grid)
    assert.ok(res.ok)
    assert.equal(res.rows.length, 3)
    assert.equal(res.stats.scanned, 3)
  })

  test('descarta teléfonos irrecuperables y los cuenta aparte', () => {
    const grid = clientesGrid()
    grid.push([null, null, 'Sin', 'Tlf', '', '', ''])
    grid.push([null, null, 'Basura', '', '12', '', ''])
    const res = parseBooksyGrid(grid)
    assert.ok(res.ok)
    assert.equal(res.rows.length, 3)
    assert.equal(res.stats.droppedNoPhone, 2)
  })

  test('deduplica por teléfono dentro del mismo fichero', () => {
    const grid = clientesGrid()
    // Mismo humano, otra grafía: debe colapsar contra +34644288663.
    grid.push([null, null, 'Marc', 'Duplicado', '+34 644 288 663', '', ''])
    const res = parseBooksyGrid(grid)
    assert.ok(res.ok)
    assert.equal(res.rows.length, 3)
    assert.equal(res.stats.droppedDuplicate, 1)
  })

  test('vacía el nombre cuando Booksy ha metido ahí el teléfono', () => {
    const grid = clientesGrid()
    grid.push([null, null, '611 22 33 55', '', '611223355', '', ''])
    const res = parseBooksyGrid(grid)
    assert.ok(res.ok)
    const anonimo = res.rows.find((r) => r.phone === '+34611223355')
    assert.ok(anonimo)
    assert.equal(anonimo.name, null)
  })

  test('ignora las filas completamente vacías del export', () => {
    const grid = clientesGrid()
    grid.splice(7, 0, [], [null, null, '', '', '', '', ''])
    const res = parseBooksyGrid(grid)
    assert.ok(res.ok)
    assert.equal(res.stats.scanned, 3)
  })

  test('sin cabecera reconocible → no_header', () => {
    assert.equal(parseBooksyGrid([['x', 'y'], [1, 2]]).ok, false)
    const res = parseBooksyGrid([['x', 'y'], [1, 2]])
    assert.equal(res.ok, false)
    assert.equal(res.code, 'no_header')
  })
})

// ── Camino real: xlsx generado → cifrado → leído ───────────────────────────

/** Serializa una matriz a un .xlsx real con exceljs. */
async function gridToXlsx(grid: SheetGrid, sheetName = 'Clientes'): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName)
  for (const row of grid) ws.addRow(row as unknown[])
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

/** Cifra un xlsx igual que hace Booksy antes de mandarlo por correo. */
async function encryptXlsx(buffer: Buffer, password: string): Promise<Buffer> {
  const officeCrypto = (await import('officecrypto-tool')).default as unknown as {
    encrypt(input: Uint8Array, options: { password: string }): Uint8Array
  }
  return Buffer.from(officeCrypto.encrypt(buffer, { password }))
}

describe('parseBooksyWorkbook', () => {
  test('lee un xlsx sin contraseña', async () => {
    const res = await parseBooksyWorkbook(await gridToXlsx(clientesGrid()))
    assert.ok(res.ok)
    assert.equal(res.sheetName, 'Clientes')
    assert.equal(res.rows.length, 3)
    assert.equal(res.rows[0].phone, '+34644288663')
  })

  test('lee un xlsx cifrado con la contraseña correcta', async () => {
    const encrypted = await encryptXlsx(await gridToXlsx(clientesGrid()), PASSWORD)
    assert.equal(looksCompoundFile(encrypted), true)
    const res = await parseBooksyWorkbook(encrypted, PASSWORD)
    assert.ok(res.ok)
    assert.deepEqual(
      res.rows.map((r) => r.phone),
      ['+34644288663', '+34611223344', '+447911123456'],
    )
  })

  test('cifrado sin contraseña → password_required', async () => {
    const encrypted = await encryptXlsx(await gridToXlsx(clientesGrid()), PASSWORD)
    const res = await parseBooksyWorkbook(encrypted)
    assert.equal(res.ok, false)
    assert.equal(res.code, 'password_required')
  })

  test('cifrado con contraseña incorrecta → password_wrong', async () => {
    const encrypted = await encryptXlsx(await gridToXlsx(clientesGrid()), PASSWORD)
    const res = await parseBooksyWorkbook(encrypted, 'no-es-esta')
    assert.equal(res.ok, false)
    assert.equal(res.code, 'password_wrong')
  })

  test('un OLE sin cifrar (.xls antiguo) no pide contraseña', async () => {
    // Cabecera de OLE Compound File + relleno: ni cifrado ni legible por
    // exceljs. Lo que NO debe pasar es que le pidamos una contraseña que
    // el fichero no tiene.
    const fakeXls = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(1024),
    ])
    const res = await parseBooksyWorkbook(fakeXls)
    assert.equal(res.ok, false)
    assert.notEqual(res.code, 'password_required')
    assert.ok(res.code === 'legacy_xls' || res.code === 'unreadable')
  })

  test('un fichero que no es xlsx → unreadable', async () => {
    const res = await parseBooksyWorkbook(Buffer.from('nombre,telefono\nMarc,644288663\n'))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'unreadable')
  })

  test('se queda con la hoja que sí trae teléfonos', async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const portada = wb.addWorksheet('Resumen')
    for (const row of informeGrid()) portada.addRow(row as unknown[])
    const buena = wb.addWorksheet('Clientes')
    for (const row of clientesGrid()) buena.addRow(row as unknown[])
    const buf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer)

    const res = await parseBooksyWorkbook(buf)
    assert.ok(res.ok)
    assert.equal(res.sheetName, 'Clientes')
  })

  test('si ninguna hoja trae teléfonos, reporta no_phone_column', async () => {
    const res = await parseBooksyWorkbook(await gridToXlsx(informeGrid(), 'Informe'))
    assert.equal(res.ok, false)
    assert.equal(res.code, 'no_phone_column')
  })
})
