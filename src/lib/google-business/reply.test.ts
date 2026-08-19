import test from 'node:test'
import assert from 'node:assert/strict'
import { validateReply, shouldAutoPublish, MAX_REPLY_LENGTH } from './reply.ts'

// -----------------------------------------------------------------------------
// validateReply
// -----------------------------------------------------------------------------

test('validateReply: vacío o solo espacios → not ok, reason "empty"', () => {
  assert.deepEqual(validateReply(''), { ok: false, reason: 'empty' })
  assert.deepEqual(validateReply('   \n\t  '), { ok: false, reason: 'empty' })
})

test('validateReply: texto normal dentro de límites → ok', () => {
  const result = validateReply(
    '¡Gracias por tu reseña! Nos alegra mucho que hayas disfrutado del corte, te esperamos pronto.',
  )
  assert.deepEqual(result, { ok: true })
})

test('validateReply: excede MAX_REPLY_LENGTH → not ok, reason "too_long"', () => {
  const long = 'a'.repeat(MAX_REPLY_LENGTH + 1)
  assert.deepEqual(validateReply(long), { ok: false, reason: 'too_long' })
})

test('validateReply: justo en el límite (MAX_REPLY_LENGTH exacto) → ok', () => {
  const exact = 'a'.repeat(MAX_REPLY_LENGTH)
  assert.equal(validateReply(exact).ok, true)
})

test('validateReply: detecta markdown — negrita, headings, listas, enlaces, código', () => {
  assert.deepEqual(validateReply('**Gracias** por tu visita'), { ok: false, reason: 'markdown' })
  assert.deepEqual(validateReply('# Gracias por tu visita'), { ok: false, reason: 'markdown' })
  assert.deepEqual(validateReply('- Gracias\n- Vuelve pronto'), { ok: false, reason: 'markdown' })
  assert.deepEqual(
    validateReply('Mira nuestra web [aquí](https://otracita.es)'),
    { ok: false, reason: 'markdown' },
  )
  assert.deepEqual(validateReply('Usa el código `PROMO10`'), { ok: false, reason: 'markdown' })
})

test('validateReply: guiones sueltos en mitad de frase NO son un falso positivo de markdown', () => {
  const result = validateReply('Gracias - de verdad - por tu visita, vuelve cuando quieras')
  assert.equal(result.ok, true)
})

// -----------------------------------------------------------------------------
// shouldAutoPublish
// -----------------------------------------------------------------------------

test('shouldAutoPublish: true solo para 4 y 5 estrellas', () => {
  assert.equal(shouldAutoPublish(5), true)
  assert.equal(shouldAutoPublish(4), true)
  assert.equal(shouldAutoPublish(3), false)
  assert.equal(shouldAutoPublish(2), false)
  assert.equal(shouldAutoPublish(1), false)
})
