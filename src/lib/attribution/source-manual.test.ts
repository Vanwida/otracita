import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MANUAL_SOURCES,
  MANUAL_SOURCE_LABEL,
  isManualSource,
  type ManualSource,
} from './source-manual.ts'

// -----------------------------------------------------------------------------
// F3 Reni — selector de origen al cierre de cita. La PATCH /api/bookings/[id]
// confía en este predicado para validar el override manual. Si rompes el
// contrato (añades un valor sin actualizar el enum, o el guard deja pasar
// algo no listado) los datos quedan inconsistentes y los reportes mienten.
// -----------------------------------------------------------------------------

describe('MANUAL_SOURCES — contrato', () => {
  it('contiene exactamente los 6 canales decididos para F3', () => {
    assert.deepEqual(
      [...MANUAL_SOURCES].sort(),
      [
        'facebook',
        'google_maps',
        'instagram',
        'referral',
        'tiktok',
        'walk_in',
      ],
    )
  })

  it('todo canal tiene una etiqueta human-readable en español', () => {
    for (const src of MANUAL_SOURCES) {
      const label = MANUAL_SOURCE_LABEL[src]
      assert.ok(label, `Falta MANUAL_SOURCE_LABEL[${src}]`)
      assert.ok(label.length > 0)
    }
  })
})

describe('isManualSource — guard', () => {
  it('acepta los 6 canales válidos', () => {
    for (const src of MANUAL_SOURCES) {
      assert.equal(isManualSource(src), true, `${src} debería ser válido`)
    }
  })

  it('rechaza string que no está en el enum', () => {
    assert.equal(isManualSource('whatsapp'), false)
    assert.equal(isManualSource('google_ads'), false) // existe en first_source pero NO en manual
    assert.equal(isManualSource('Instagram'), false)  // case-sensitive a propósito
    assert.equal(isManualSource(''), false)
  })

  it('rechaza no-strings', () => {
    assert.equal(isManualSource(null), false)
    assert.equal(isManualSource(undefined), false)
    assert.equal(isManualSource(42), false)
    assert.equal(isManualSource({}), false)
    assert.equal(isManualSource([]), false)
  })

  it('narrow el tipo cuando devuelve true', () => {
    const v: unknown = 'instagram'
    if (isManualSource(v)) {
      // Si TypeScript compila esta línea es que el narrow funciona.
      const narrowed: ManualSource = v
      assert.equal(narrowed, 'instagram')
    } else {
      assert.fail('isManualSource debería haber narrow a true')
    }
  })
})
