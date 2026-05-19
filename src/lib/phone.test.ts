import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizePhone, canonicalPhone } from './phone.ts'

// -----------------------------------------------------------------------------
// Pure helper — no DB, no I/O. The single most important guarantee: the
// three exact reported fragmentation cases collapse to ONE canonical value
// so the same human stops splitting into multiple `customers` rows.
// -----------------------------------------------------------------------------

const REPORTED = '+34644288663'

test('the exact reported cases all canonicalize to the same E.164 value', () => {
  // These three were producing three separate customer rows in prod.
  assert.equal(canonicalPhone('644288663'), REPORTED)
  assert.equal(canonicalPhone('+34644288663'), REPORTED)
  assert.equal(canonicalPhone('34644288663'), REPORTED)
})

test('all three reported cases are equal to each other (dedupe invariant)', () => {
  const a = canonicalPhone('644288663')
  const b = canonicalPhone('+34644288663')
  const c = canonicalPhone('34644288663')
  assert.equal(a, b)
  assert.equal(b, c)
})

test('00 / 0034 international prefix → same canonical', () => {
  assert.equal(canonicalPhone('0034644288663'), REPORTED)
  assert.equal(canonicalPhone('00 34 644 288 663'), REPORTED)
})

test('separators (spaces, dashes, dots, parens) are stripped', () => {
  assert.equal(canonicalPhone('+34 644 28 86 63'), REPORTED)
  assert.equal(canonicalPhone('644-28-86-63'), REPORTED)
  assert.equal(canonicalPhone('644.288.663'), REPORTED)
  assert.equal(canonicalPhone('(+34) 644 288 663'), REPORTED)
  assert.equal(canonicalPhone('  644288663  '), REPORTED)
})

test('the WhatsApp Cloud API shape (bare 34… no +) matches the +34 form', () => {
  // Meta delivers `from` like "34644288663". A customer who once typed
  // "+34 644 288 663" in the PWA must resolve to the SAME row.
  assert.equal(canonicalPhone('34644288663'), canonicalPhone('+34 644 288 663'))
})

test('bare Spanish mobile and landline prefixes default to +34', () => {
  assert.equal(canonicalPhone('612345678'), '+34612345678')
  assert.equal(canonicalPhone('722334455'), '+34722334455')
  assert.equal(canonicalPhone('911234567'), '+34911234567')
})

test('already-E.164 FOREIGN numbers pass through (never coerced to +34)', () => {
  const c1 = canonicalizePhone('+447911123456')
  assert.equal(c1.value, '+447911123456')
  assert.equal(c1.valid, true)

  const c2 = canonicalizePhone('+12025550123')
  assert.equal(c2.value, '+12025550123')
  assert.equal(c2.valid, true)
})

test('valid Spanish input reports valid: true', () => {
  for (const raw of ['644288663', '+34644288663', '34644288663', '0034644288663']) {
    assert.equal(canonicalizePhone(raw).valid, true, `expected ${raw} valid`)
  }
})

test('empty / whitespace / null / undefined → empty value, not valid, no throw', () => {
  for (const raw of ['', '   ', null, undefined]) {
    const c = canonicalizePhone(raw)
    assert.equal(c.value, '')
    assert.equal(c.valid, false)
  }
})

test('unparseable garbage → trimmed raw preserved, valid: false, never throws', () => {
  const c = canonicalizePhone('  not-a-phone  ')
  assert.equal(c.value, 'not-a-phone')
  assert.equal(c.valid, false)
})

test('too-short digit string is not silently promoted to a valid number', () => {
  const c = canonicalizePhone('12345')
  assert.equal(c.valid, false)
  // raw preserved so the record stays attributable / fixable
  assert.equal(c.value, '12345')
})

test('canonicalization is idempotent (canonical(canonical(x)) === canonical(x))', () => {
  for (const raw of ['644288663', '+34 644 28 86 63', '0034644288663', '+447911123456']) {
    const once = canonicalPhone(raw)
    const twice = canonicalPhone(once)
    assert.equal(twice, once, `idempotency failed for ${raw}`)
  }
})

test('canonicalPhone shorthand equals canonicalizePhone(...).value', () => {
  for (const raw of ['644288663', 'garbage', '', '+12025550123']) {
    assert.equal(canonicalPhone(raw), canonicalizePhone(raw).value)
  }
})

test('the import-vision pseudo-phone fallback stays untouched (no false match)', () => {
  // import-vision uses `import-<ts>-<i>` placeholders for OCR rows without
  // a real phone. These must NOT collapse together or look valid.
  const a = canonicalizePhone('import-1700000000000-0')
  const b = canonicalizePhone('import-1700000000000-1')
  assert.equal(a.valid, false)
  assert.equal(b.valid, false)
  assert.notEqual(a.value, b.value)
})
