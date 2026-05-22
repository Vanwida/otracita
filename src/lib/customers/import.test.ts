import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyRow,
  classifyRows,
  normalizeEmail,
  resolveDuplicateUpdate,
  type ExistingCustomer,
  type ImportRow,
} from './import.ts'

// -----------------------------------------------------------------------------
// Pure helpers — no DB, no I/O. Tests cubren los 4 estados de clasificación
// (ok / duplicate / invalid_phone:no_phone / invalid_phone:unparseable) y la
// regla de "update-if-empty" para nombre. Match exacto con la canon de
// phone.ts: queremos que 644288663, +34644288663 y 34644288663 colapsen al
// MISMO E.164 al deduplicar.
// -----------------------------------------------------------------------------

const E = '+34644288663'

test('classifyRow: phone bare ES → ok con phone E.164', () => {
  const r = classifyRow({ phone: '644288663', name: 'Juan' }, new Map())
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.phone, E)
  assert.equal(r.name, 'Juan')
})

test('classifyRow: phone con prefijo +34 + espacios → ok mismo E.164', () => {
  const r = classifyRow({ phone: '+34 644 28 86 63' }, new Map())
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.phone, E)
})

test('classifyRow: phone bare 34 sin + → ok mismo E.164', () => {
  const r = classifyRow({ phone: '34644288663' }, new Map())
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.phone, E)
})

test('classifyRow: phone con guiones → ok mismo E.164', () => {
  const r = classifyRow({ phone: '644-28-86-63' }, new Map())
  assert.equal(r.kind, 'ok')
  if (r.kind !== 'ok') return
  assert.equal(r.phone, E)
})

test('classifyRow: phone vacío → invalid_phone:no_phone', () => {
  const r = classifyRow({ phone: '' }, new Map())
  assert.equal(r.kind, 'invalid_phone')
  if (r.kind !== 'invalid_phone') return
  assert.equal(r.reason, 'no_phone')
})

test('classifyRow: phone sólo whitespace → invalid_phone:no_phone', () => {
  const r = classifyRow({ phone: '   ' }, new Map())
  assert.equal(r.kind, 'invalid_phone')
  if (r.kind !== 'invalid_phone') return
  assert.equal(r.reason, 'no_phone')
})

test('classifyRow: phone basura → invalid_phone:unparseable', () => {
  const r = classifyRow({ phone: 'abc' }, new Map())
  assert.equal(r.kind, 'invalid_phone')
  if (r.kind !== 'invalid_phone') return
  assert.equal(r.reason, 'unparseable')
})

test('classifyRow: existing por mismo E.164 → duplicate (aunque CSV use otro formato)', () => {
  const existing = new Map<string, ExistingCustomer>([
    [E, { phone: E, name: 'Juan' }],
  ])
  // CSV mete el mismo número con formato distinto — debe matchear.
  const r = classifyRow({ phone: '644 28 86 63', name: 'Juan Updated' }, existing)
  assert.equal(r.kind, 'duplicate')
})

test('normalizeEmail: trim + lowercase; formas malas → null', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM  '), 'foo@bar.com')
  assert.equal(normalizeEmail(''), null)
  assert.equal(normalizeEmail(null), null)
  assert.equal(normalizeEmail('not-an-email'), null)
  assert.equal(normalizeEmail('a@b'), null)
})

test('resolveDuplicateUpdate: existing.name=null + csv.name → devuelve csv name', () => {
  const existing: ExistingCustomer = { phone: E, name: null }
  assert.equal(resolveDuplicateUpdate(existing, 'Juan'), 'Juan')
})

test('resolveDuplicateUpdate: existing.name="" + csv.name → devuelve csv name', () => {
  const existing: ExistingCustomer = { phone: E, name: '   ' }
  assert.equal(resolveDuplicateUpdate(existing, 'Juan'), 'Juan')
})

test('resolveDuplicateUpdate: existing.name puesto → null (no sobrescribe)', () => {
  const existing: ExistingCustomer = { phone: E, name: 'Juan Pérez' }
  assert.equal(resolveDuplicateUpdate(existing, 'Otro Nombre'), null)
})

test('resolveDuplicateUpdate: csv.name vacío → null (no hay nada que escribir)', () => {
  const existing: ExistingCustomer = { phone: E, name: null }
  assert.equal(resolveDuplicateUpdate(existing, null), null)
  assert.equal(resolveDuplicateUpdate(existing, ''), null)
})

test('classifyRows: summary cuenta ok / duplicates / invalid y toUpdate', () => {
  const existing: ExistingCustomer[] = [
    { phone: E, name: null }, // duplicate que SÍ se actualiza
    { phone: '+34911234567', name: 'Carlos' }, // duplicate que NO (ya tiene name)
  ]
  const rows: ImportRow[] = [
    { phone: '644288663', name: 'Juan' },           // duplicate → toUpdate
    { phone: '+34 911 234 567', name: 'Cualquiera' }, // duplicate sin update (name ya puesto)
    { phone: '600111222', name: 'Marta' },           // ok
    { phone: '', name: 'Sin tlf' },                  // invalid no_phone
    { phone: 'xxx', name: 'Basura' },                // invalid unparseable
  ]
  const { summary } = classifyRows(rows, existing)
  assert.equal(summary.total, 5)
  assert.equal(summary.ok, 1)
  assert.equal(summary.duplicates, 2)
  assert.equal(summary.invalid, 2)
  assert.equal(summary.toUpdate, 1)
})
