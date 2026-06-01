import test from 'node:test'
import assert from 'node:assert/strict'
import { isSelfServiceSource } from './source.ts'

// El cliente bloqueado solo se rechaza en canales self-service. Si esta
// clasificación se rompe, un bloqueado podría reservar por bot/PWA (falso
// negativo) o el barbero no podría agendarlo a mano (falso positivo).

test('isSelfServiceSource — bot/web/voice son self-service', () => {
  assert.equal(isSelfServiceSource('bot'), true)
  assert.equal(isSelfServiceSource('web'), true)
  assert.equal(isSelfServiceSource('voice'), true)
})

test('isSelfServiceSource — dashboard e import NO son self-service', () => {
  assert.equal(isSelfServiceSource('dashboard'), false)
  assert.equal(isSelfServiceSource('import'), false)
})

test('isSelfServiceSource — origen desconocido no se trata como self-service', () => {
  assert.equal(isSelfServiceSource('unknown'), false)
  assert.equal(isSelfServiceSource(''), false)
})
