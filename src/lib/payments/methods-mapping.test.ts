import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_SHORT_LABEL,
  PAYMENT_METHOD_IS_INSTANT,
  PAYMENT_METHOD_ICON,
  CASH_MOVEMENT_METHOD_FROM_PAYMENT,
  type PaymentMethod,
} from './methods.ts'

// -----------------------------------------------------------------------------
// Tests COMPLEMENTARIOS a methods.test.ts — aquí solo lo que el otro fichero
// no cubre:
//   · Coverage de los Records auxiliares (labels, icon, short label).
//   · "Flow esperado por /charge para cada método" — fija el contrato
//     (instant vs no-instant + bucket cash_movements) que el endpoint usa
//     para decidir si cierra el cobro al vuelo o queda pending.
// La whitelist + isPaymentMethod + mapeo individual viven en methods.test.ts.
// -----------------------------------------------------------------------------

describe('records auxiliares — coverage total por método', () => {
  it('PAYMENT_METHOD_LABEL: cada método tiene etiqueta humana no-vacía', () => {
    for (const m of PAYMENT_METHODS) {
      const label = PAYMENT_METHOD_LABEL[m]
      assert.equal(typeof label, 'string')
      assert.ok(label.length > 0, `${m} tiene label no-vacía`)
    }
  })

  it('PAYMENT_METHOD_SHORT_LABEL: cada método tiene etiqueta corta', () => {
    for (const m of PAYMENT_METHODS) {
      const label = PAYMENT_METHOD_SHORT_LABEL[m]
      assert.equal(typeof label, 'string')
      assert.ok(label.length > 0, `${m} tiene short label`)
    }
  })

  it('PAYMENT_METHOD_ICON: cada método tiene nombre de icono lucide', () => {
    for (const m of PAYMENT_METHODS) {
      const icon = PAYMENT_METHOD_ICON[m]
      assert.equal(typeof icon, 'string')
      assert.ok(icon.length > 0, `${m} tiene icon`)
    }
  })
})

describe('flow esperado por /charge para cada método', () => {
  it('cash: instant + cash_movement=cash → cierre inmediato', () => {
    const m: PaymentMethod = 'cash'
    assert.equal(PAYMENT_METHOD_IS_INSTANT[m], true)
    assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT[m], 'cash')
  })

  it('card_physical: instant + cash_movement=card → cierre tras OK del datáfono', () => {
    const m: PaymentMethod = 'card_physical'
    assert.equal(PAYMENT_METHOD_IS_INSTANT[m], true)
    assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT[m], 'card')
  })

  it('bizum: instant + cash_movement=card → cierre inmediato cuadrando junto a tarjeta', () => {
    const m: PaymentMethod = 'bizum'
    assert.equal(PAYMENT_METHOD_IS_INSTANT[m], true)
    assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT[m], 'card')
  })

  it('card_online: NO instant + cash_movement=online → espera a webhook Stripe', () => {
    const m: PaymentMethod = 'card_online'
    assert.equal(PAYMENT_METHOD_IS_INSTANT[m], false)
    assert.equal(CASH_MOVEMENT_METHOD_FROM_PAYMENT[m], 'online')
  })
})
