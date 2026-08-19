import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// -----------------------------------------------------------------------------
// Idempotencia del cron de sellos: el ON CONFLICT y el índice deben cuadrar
//
// El cron de awards se apoya en INFERENCIA POR ÍNDICE:
//
//   INSERT INTO loyalty_ledger ... ON CONFLICT (booking_id)
//     WHERE reason = 'booking_completed' DO NOTHING
//
// Postgres sólo acepta eso si existe un índice UNIQUE sobre exactamente esa
// columna cuyo predicado esté implicado por ese WHERE. Si el índice no existe,
// o su predicado difiere aunque sea en un `AND` de más, cada insert muere con
// 42P10 y no se otorga ni un sello — que es justo el P0 que estos tests
// vigilan. No hay forma de comprobarlo en runtime sin DB, así que lo
// comprobamos estáticamente: los tres sitios que declaran el índice
// (migración, schema.ts, cron) tienen que decir lo mismo.
// -----------------------------------------------------------------------------

const ROOT = join(import.meta.dirname, '..', '..', '..')
const MIGRATIONS_DIR = join(ROOT, 'drizzle')
const SCHEMA = join(ROOT, 'src', 'db', 'schema.ts')
const CRON = join(ROOT, 'src', 'app', 'api', 'cron', 'loyalty-award', 'route.ts')

const INDEX_NAME = 'loyalty_ledger_booking_completed_uniq'

/** Quita comillas dobles de identificadores y colapsa espacios. */
function normalize(sqlFragment: string): string {
  return sqlFragment.replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Localiza el CREATE UNIQUE INDEX parcial sobre loyalty_ledger en drizzle/. */
function findMigratedIndex(): { columns: string; predicate: string; file: string } {
  const pattern =
    /create\s+unique\s+index(?:\s+if\s+not\s+exists)?\s+"?loyalty_ledger_booking_completed_uniq"?\s+on\s+"?loyalty_ledger"?\s*\(([^)]*)\)\s*where\s+([^;]+);/i

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    // Ignoramos las líneas de comentario (`--`) para no casar con los ejemplos
    // que documentan el índice en la cabecera de la propia migración.
    const statements = body
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    const match = pattern.exec(statements)
    if (match) {
      return { columns: normalize(match[1]), predicate: normalize(match[2]), file }
    }
  }
  throw new Error(`Ninguna migración en drizzle/ crea el índice ${INDEX_NAME}`)
}

/** Extrae la cláusula ON CONFLICT (...) WHERE ... del INSERT del cron. */
function findCronArbiter(): { columns: string; predicate: string } {
  const body = readFileSync(CRON, 'utf8')
  const match = /on\s+conflict\s*\(([^)]*)\)\s*where\s+(.+?)\s+do\s+nothing/i.exec(body)
  assert.ok(match, 'El cron ya no hace ON CONFLICT (...) WHERE ... DO NOTHING')
  return { columns: normalize(match[1]), predicate: normalize(match[2]) }
}

test('existe una migración que crea el índice parcial único del award', () => {
  const migrated = findMigratedIndex()
  assert.equal(migrated.columns, 'booking_id')
  assert.equal(migrated.predicate, "reason = 'booking_completed'")
})

test('el ON CONFLICT del cron infiere exactamente ese índice', () => {
  const migrated = findMigratedIndex()
  const arbiter = findCronArbiter()

  assert.equal(
    arbiter.columns,
    migrated.columns,
    'la columna árbitro del ON CONFLICT no coincide con la del índice → 42P10',
  )
  assert.equal(
    arbiter.predicate,
    migrated.predicate,
    'el predicado del ON CONFLICT no coincide con el del índice parcial → 42P10',
  )
})

test('la fila insertada por el cron cae dentro del predicado del índice', () => {
  const body = readFileSync(CRON, 'utf8')
  const insert = /insert\s+into\s+loyalty_ledger[\s\S]*?do\s+nothing/i.exec(body)
  assert.ok(insert, 'No se encuentra el INSERT INTO loyalty_ledger del cron')

  // Si el cron dejara de insertar reason='booking_completed', el índice parcial
  // no cubriría la fila y la idempotencia se perdería en silencio (duplicados).
  const reason = findMigratedIndex().predicate.match(/'([^']+)'/)?.[1]
  assert.ok(
    insert[0].includes(`'${reason}'`),
    `El INSERT del cron ya no escribe reason='${reason}'`,
  )
})

test('schema.ts declara el mismo índice que la migración', () => {
  const schema = readFileSync(SCHEMA, 'utf8')
  const declaration = new RegExp(
    `uniqueIndex\\('${INDEX_NAME}'\\)[\\s\\S]{0,200}?\\.where\\(sql\`([^\`]+)\``,
  ).exec(schema)
  assert.ok(declaration, `schema.ts no declara uniqueIndex('${INDEX_NAME}')`)

  assert.match(schema, /\.on\(table\.bookingId\)/)
  assert.equal(normalize(declaration[1]), findMigratedIndex().predicate)
})
