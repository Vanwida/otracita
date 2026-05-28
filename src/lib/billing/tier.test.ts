import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTier,
  isInTrial,
  trialDaysLeft,
  hasFeature,
  minTierFor,
  isUpgrade,
  resolveSubscriptionSync,
  TIER_PRICES,
  TRIAL_DAYS_BY_TIER,
} from './tier.ts';

const NOW = new Date('2026-04-30T12:00:00Z');
const FUTURE = new Date('2026-05-10T12:00:00Z');
const PAST = new Date('2026-04-20T12:00:00Z');

function client(overrides: Partial<Parameters<typeof getTier>[0]> = {}) {
  return {
    tier: 'solo' as const,
    plan: 'chatbot',
    status: 'active',
    trialEndsAt: null,
    trialStartedAt: null,
    stripeSubscriptionId: null,
    ...overrides,
  } as Parameters<typeof getTier>[0];
}

describe('getTier', () => {
  it('returns explicit tier when set', () => {
    assert.equal(getTier(client({ tier: 'pro' })), 'pro');
    assert.equal(getTier(client({ tier: 'estudio' })), 'estudio');
    assert.equal(getTier(client({ tier: 'solo' })), 'solo');
  });

  it('falls back to legacy plan when tier is unknown', () => {
    // @ts-expect-error simulating legacy data
    assert.equal(getTier(client({ tier: null, plan: 'chatbot' })), 'pro');
    // @ts-expect-error simulating legacy data
    assert.equal(getTier(client({ tier: null, plan: 'full' })), 'estudio');
    // @ts-expect-error simulating legacy data
    assert.equal(getTier(client({ tier: null, plan: 'ads' })), 'solo');
  });
});

describe('isInTrial', () => {
  it('false when trialEndsAt is null', () => {
    assert.equal(isInTrial(client()), false);
  });
  it('true when trialEndsAt is in the future', () => {
    assert.equal(isInTrial(client({ trialEndsAt: FUTURE }), NOW), true);
  });
  it('false when trialEndsAt is in the past', () => {
    assert.equal(isInTrial(client({ trialEndsAt: PAST }), NOW), false);
  });
});

describe('trialDaysLeft', () => {
  it('returns 0 when no trial', () => {
    assert.equal(trialDaysLeft(client(), NOW), 0);
  });
  it('rounds up partial days', () => {
    // 10 días y 12h => 11 días redondeados hacia arriba
    const c = client({ trialEndsAt: new Date(NOW.getTime() + 10.5 * 24 * 60 * 60 * 1000) });
    assert.equal(trialDaysLeft(c, NOW), 11);
  });
  it('returns 0 when trial already ended', () => {
    assert.equal(trialDaysLeft(client({ trialEndsAt: PAST }), NOW), 0);
  });
});

describe('hasFeature', () => {
  it('Solo tier can use solo features', () => {
    const c = client({ tier: 'solo' });
    assert.equal(hasFeature(c, 'agenda'), true);
    assert.equal(hasFeature(c, 'caja'), true);
    assert.equal(hasFeature(c, 'veriFactu'), true);
  });
  it('Solo tier cannot use Pro features', () => {
    const c = client({ tier: 'solo' });
    assert.equal(hasFeature(c, 'whatsappBot'), false);
    assert.equal(hasFeature(c, 'sumupTapToPay'), false);
    assert.equal(hasFeature(c, 'multiBarber'), false);
  });
  it('Pro tier can use Pro and Solo features but not Estudio', () => {
    const c = client({ tier: 'pro' });
    assert.equal(hasFeature(c, 'agenda'), true);
    assert.equal(hasFeature(c, 'whatsappBot'), true);
    assert.equal(hasFeature(c, 'sumupTapToPay'), true);
    assert.equal(hasFeature(c, 'recepcionistaIA'), false);
    assert.equal(hasFeature(c, 'subdominioPropio'), false);
  });
  it('Estudio tier can use everything', () => {
    const c = client({ tier: 'estudio' });
    assert.equal(hasFeature(c, 'agenda'), true);
    assert.equal(hasFeature(c, 'whatsappBot'), true);
    assert.equal(hasFeature(c, 'recepcionistaIA'), true);
    assert.equal(hasFeature(c, 'subdominioPropio'), true);
  });
  it('Solo + active trial unlocks Pro features', () => {
    const c = client({ tier: 'solo', trialEndsAt: FUTURE });
    assert.equal(hasFeature(c, 'whatsappBot', NOW), true);
    assert.equal(hasFeature(c, 'sumupTapToPay', NOW), true);
    // pero NO Estudio
    assert.equal(hasFeature(c, 'recepcionistaIA', NOW), false);
  });
  it('cancelled status loses everything above Solo', () => {
    const c = client({ tier: 'pro', status: 'cancelled' });
    assert.equal(hasFeature(c, 'agenda'), true);
    assert.equal(hasFeature(c, 'whatsappBot'), false);
  });
});

describe('minTierFor', () => {
  it('returns the configured minimum', () => {
    assert.equal(minTierFor('agenda'), 'solo');
    assert.equal(minTierFor('whatsappBot'), 'pro');
    assert.equal(minTierFor('recepcionistaIA'), 'estudio');
  });
});

describe('isUpgrade', () => {
  it('solo→pro is upgrade', () => assert.equal(isUpgrade('solo', 'pro'), true));
  it('pro→estudio is upgrade', () => assert.equal(isUpgrade('pro', 'estudio'), true));
  it('pro→solo is NOT upgrade', () => assert.equal(isUpgrade('pro', 'solo'), false));
  it('pro→pro is NOT upgrade', () => assert.equal(isUpgrade('pro', 'pro'), false));
});

describe('TIER_PRICES sanity', () => {
  it('Solo is free', () => {
    assert.equal(TIER_PRICES.solo.monthly, 0);
    assert.equal(TIER_PRICES.solo.annual, 0);
  });
  it('Annual is cheaper than monthly per month', () => {
    assert.ok(TIER_PRICES.pro.annual < TIER_PRICES.pro.monthly);
    assert.ok(TIER_PRICES.estudio.annual < TIER_PRICES.estudio.monthly);
  });
});

describe('TRIAL_DAYS_BY_TIER', () => {
  it('Pro has 14 day trial', () => {
    assert.equal(TRIAL_DAYS_BY_TIER.pro, 14);
  });
  it('Solo and Estudio have no trial', () => {
    assert.equal(TRIAL_DAYS_BY_TIER.solo, null);
    assert.equal(TRIAL_DAYS_BY_TIER.estudio, null);
  });
});

describe('resolveSubscriptionSync', () => {
  const TRIAL_END = new Date('2026-06-10T00:00:00Z');

  // --- Bug G4: flujo "tenant creado primero, luego suscripción" (Reni) ------
  it('G4: cliente existente (active) + trialing + tier pro → persiste tier pro', () => {
    // Reni: ya existe como 'solo'/'pending', activa trial Pro. Stripe manda
    // subscription.updated status=trialing. Antes del fix el tier NO se
    // actualizaba porque el cliente no venía de cancelled.
    const sync = resolveSubscriptionSync('trialing', 'pro', 'pending', TRIAL_END);
    assert.equal(sync.tier, 'pro');
    assert.equal(sync.trialEndsAt, TRIAL_END);
    // No re-activamos status: el cliente no venía de cancelled.
    assert.equal(sync.status, undefined);
  });

  it('G4: trial expira a active (pagando) + tier pro → clients.tier sigue pro', () => {
    // El día 14: status pasa de trialing a active. trial_end ya pasó → null.
    const sync = resolveSubscriptionSync('active', 'pro', 'active', null);
    assert.equal(sync.tier, 'pro');
    assert.equal(sync.trialEndsAt, null);
  });

  it('G4: cliente existente + active + tier estudio → persiste estudio', () => {
    const sync = resolveSubscriptionSync('active', 'estudio', 'active', null);
    assert.equal(sync.tier, 'estudio');
  });

  it('idempotente: re-aplicar active+pro repetidas veces da el mismo update', () => {
    const a = resolveSubscriptionSync('active', 'pro', 'active', null);
    const b = resolveSubscriptionSync('active', 'pro', 'active', null);
    assert.deepEqual(a, b);
  });

  // --- Re-activación desde cancelled ----------------------------------------
  it('re-activación: cancelled + active + tier pro → status active + tier pro', () => {
    const sync = resolveSubscriptionSync('active', 'pro', 'cancelled', null);
    assert.equal(sync.status, 'active');
    assert.equal(sync.tier, 'pro');
  });

  // --- Downgrade (NO debe romperse) -----------------------------------------
  it('downgrade: canceled → status cancelled, tier solo, billing null', () => {
    const sync = resolveSubscriptionSync('canceled', 'pro', 'active', TRIAL_END);
    assert.equal(sync.status, 'cancelled');
    assert.equal(sync.tier, 'solo');
    assert.equal(sync.billingInterval, null);
    assert.equal(sync.trialEndsAt, null);
  });

  it('downgrade: paused/unpaid/incomplete_expired también degradan a solo', () => {
    for (const s of ['paused', 'unpaid', 'incomplete_expired']) {
      const sync = resolveSubscriptionSync(s, 'pro', 'active', null);
      assert.equal(sync.tier, 'solo', `status=${s}`);
      assert.equal(sync.status, 'cancelled', `status=${s}`);
    }
  });

  // --- past_due: periodo de gracia, NO degrada -------------------------------
  it('past_due: NO degrada, solo sincroniza trialEndsAt', () => {
    const sync = resolveSubscriptionSync('past_due', 'pro', 'active', TRIAL_END);
    assert.equal(sync.tier, undefined); // no toca el tier
    assert.equal(sync.status, undefined); // no toca el status
    assert.equal(sync.trialEndsAt, TRIAL_END);
  });

  it('tier nulo en active no fuerza tier (defensivo, no degrada)', () => {
    const sync = resolveSubscriptionSync('active', null, 'active', null);
    assert.equal(sync.tier, undefined);
  });
});
