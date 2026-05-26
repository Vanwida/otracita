import type { BarberMonthRaw, BarberSalaryProfile, PayrollBreakdown, TierBonus } from './types'

// -----------------------------------------------------------------------------
// computeBarberPayroll — cálculo puro de la nómina mensual de UN barbero.
//
// Fórmula:
//   total = base
//         + servicios_facturados × (commissionServicesPct/100)
//         + productos_vendidos   × (commissionProductsPct/100)
//         + propinas_card (pendientes — entran al pago de nómina)
//         + bonos_cobrados (R9 — bonos por actividades)
//         + tier_bonus (F1 — bono por tramo de facturación, si aplica)
//         − alquiler_silla
//
// Todo en cents. Inputs/outputs determinísticos para tests.
//
// Defensivo: percentages se capean a [0, 100] por si entra un valor raro
// desde la API (que ya valida, pero belt-and-braces).
//
// R8: el 3er argumento opcional `precomputedServicesCommissionCents` deja
// que el caller (monthly.ts) pase una comisión de servicios ya calculada
// con overrides POR-SERVICIO. Cuando NO se pasa (tests, callers viejos),
// se mantiene EXACTAMENTE el camino histórico `revenue × globalPct` — por
// eso compute.test.ts sigue verde sin tocarlo.
//
// F1: si `salaryType === 'salaried_with_tier_bonus'`, se evalúa la lista
// `profile.tierBonuses` contra la facturación del periodo (servicios +
// productos, SIN propinas — las propinas son liberalidad del cliente al
// barbero y NO computan como facturación a efectos de comisión/tramos).
// Solo se paga el bono del tramo MÁS ALTO alcanzado (no acumulativo).
// Para cualquier OTRO `salaryType`, los tramos se ignoran completamente.
//
// R-T3 (Reni V1 Parte 2 — liquidación distinta cash vs card):
//   Las propinas CASH ya las cobró el barbero EN MANO al cliente: están en
//   su bolsillo, NO se las debe el local. Solo entran al `totalCents` las
//   propinas CARD (las cobradas vía Stripe/SumUp, que están en la cuenta
//   del local y se le pagan vía nómina fin de mes). Cash sale informativa.
//
//   Compatibilidad: si el caller pasa SÓLO `tipsCents` (camino pre-V1, sin
//   split), se asume "todo card" — mismo comportamiento de siempre. El
//   helper `normalizeTipsSplit` lo enforza.
// -----------------------------------------------------------------------------

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return Math.round(n)
}

/** F1 — Saneo común de la lista de tramos: filtra NaN/Infinity, clampa a
 *  enteros ≥ 0 y ordena por threshold ascendente. Aislado para que
 *  `selectTierBonus` y `selectNextTier` produzcan resultados consistentes
 *  sobre la misma vista normalizada (mismo input → mismo orden de salida). */
function normalizeTiers(tierBonuses: TierBonus[] | null): TierBonus[] {
  if (!tierBonuses || tierBonuses.length === 0) return []
  const clean: TierBonus[] = []
  for (const t of tierBonuses) {
    const threshold = Number.isFinite(t.thresholdCents) ? Math.max(0, Math.round(t.thresholdCents)) : NaN
    const bonus = Number.isFinite(t.bonusCents) ? Math.max(0, Math.round(t.bonusCents)) : NaN
    if (!Number.isFinite(threshold) || !Number.isFinite(bonus)) continue
    clean.push({ thresholdCents: threshold, bonusCents: bonus })
  }
  clean.sort((a, b) => a.thresholdCents - b.thresholdCents)
  return clean
}

/** F1 — Devuelve el tramo activado por una facturación dada, o null si no
 *  llega al primer threshold (o la lista está vacía). El tramo activado es
 *  el de MAYOR `thresholdCents` que sea ≤ facturado. Los tramos se ordenan
 *  internamente por threshold ascendente antes de evaluarse, por si llegan
 *  desordenados desde DB/UI. */
export function selectTierBonus(
  tierBonuses: TierBonus[] | null,
  facturadoCents: number,
): TierBonus | null {
  if (!Number.isFinite(facturadoCents) || facturadoCents <= 0) return null
  const clean = normalizeTiers(tierBonuses)
  if (clean.length === 0) return null
  let active: TierBonus | null = null
  for (const t of clean) {
    if (facturadoCents >= t.thresholdCents) active = t
    else break
  }
  return active
}

/** F1 — Devuelve el SIGUIENTE tramo aún no alcanzado y cuánto falta para
 *  cumplirlo, en cents. Sirve a la UI para mostrar motivación visible
 *  ("te faltan 500 € para +250 €"). Si el barbero ya alcanzó el último
 *  tramo, o la lista está vacía, devuelve null. */
export function selectNextTier(
  tierBonuses: TierBonus[] | null,
  facturadoCents: number,
): { tier: TierBonus; remainingCents: number } | null {
  const clean = normalizeTiers(tierBonuses)
  if (clean.length === 0) return null
  const facturado = Number.isFinite(facturadoCents) ? Math.max(0, Math.round(facturadoCents)) : 0
  for (const t of clean) {
    if (facturado < t.thresholdCents) {
      return { tier: t, remainingCents: t.thresholdCents - facturado }
    }
  }
  // Ya alcanzó el último tramo — no hay siguiente.
  return null
}

/** R-T3 — Normaliza el split cash/card de propinas en un raw, garantizando
 *  el invariante `tipsCents === tipsCashCents + tipsCardCents`:
 *    · Si el caller pasa ambos sub-totales, se respetan (clampeados ≥ 0) y
 *      `tipsCents` se recalcula como su suma (ignora cualquier valor que
 *      hubiera entrado por error en `raw.tipsCents`).
 *    · Si pasa SOLO `tipsCents` (legacy / pre-V1), se asume "todo card" —
 *      idéntico comportamiento al de siempre (Stripe Checkout).
 *    · Si pasa sólo uno de los dos, el otro se infiere por diferencia y se
 *      clampea a 0 si la diferencia es negativa. */
function normalizeTipsSplit(raw: BarberMonthRaw): {
  tipsCents: number
  tipsCashCents: number
  tipsCardCents: number
} {
  const total = Math.max(0, Math.round(raw.tipsCents ?? 0))
  const hasCash = typeof raw.tipsCashCents === 'number'
  const hasCard = typeof raw.tipsCardCents === 'number'

  if (hasCash && hasCard) {
    const cash = Math.max(0, Math.round(raw.tipsCashCents as number))
    const card = Math.max(0, Math.round(raw.tipsCardCents as number))
    return { tipsCents: cash + card, tipsCashCents: cash, tipsCardCents: card }
  }
  if (hasCard && !hasCash) {
    const card = Math.max(0, Math.round(raw.tipsCardCents as number))
    const cash = Math.max(0, total - card)
    return { tipsCents: cash + card, tipsCashCents: cash, tipsCardCents: card }
  }
  if (hasCash && !hasCard) {
    const cash = Math.max(0, Math.round(raw.tipsCashCents as number))
    const card = Math.max(0, total - cash)
    return { tipsCents: cash + card, tipsCashCents: cash, tipsCardCents: card }
  }
  // Legacy: solo tipsCents → asumir todo card (Stripe Checkout pre-V1).
  return { tipsCents: total, tipsCashCents: 0, tipsCardCents: total }
}

export function computeBarberPayroll(
  profile: BarberSalaryProfile,
  raw: BarberMonthRaw,
  precomputedServicesCommissionCents?: number,
): PayrollBreakdown {
  const base = Math.max(0, Math.round(profile.salaryBaseCents))
  const commissionServicesCents =
    precomputedServicesCommissionCents !== undefined
      ? Math.max(0, Math.round(precomputedServicesCommissionCents))
      : Math.round(
          raw.servicesRevenueCents * (clampPct(profile.commissionServicesPct) / 100),
        )
  const commissionProductsCents = Math.round(
    raw.productsRevenueCents * (clampPct(profile.commissionProductsPct) / 100),
  )
  const { tipsCents, tipsCashCents, tipsCardCents } = normalizeTipsSplit(raw)
  const bonusesPayoutCents = Math.max(0, Math.round(raw.bonusesPayoutCents))
  const chairRentCents = Math.max(0, Math.round(profile.chairRentCents))

  // F1 — Facturación a efectos de tramos = servicios + productos (sin tips).
  // Es lo que el barbero "produjo" para el local; las propinas son ajenas.
  const facturadoCents =
    Math.max(0, Math.round(raw.servicesRevenueCents)) +
    Math.max(0, Math.round(raw.productsRevenueCents))

  // Solo aplicamos el bono por tramo si el salaryType lo pide explícitamente.
  // En cualquier otro caso (incluido null) el bono queda en null y no suma.
  const tierBonus =
    profile.salaryType === 'salaried_with_tier_bonus'
      ? selectTierBonus(profile.tierBonuses, facturadoCents)
      : null
  const tierBonusCents = tierBonus ? tierBonus.bonusCents : 0

  // R-T3: solo las propinas CARD entran al total. Las CASH ya están en el
  // bolsillo del barbero (las cobró en mano al cliente) — sumarlas sería
  // doble-contar.
  const totalCents =
    base +
    commissionServicesCents +
    commissionProductsCents +
    tipsCardCents +
    bonusesPayoutCents +
    tierBonusCents -
    chairRentCents

  return {
    baseCents: base,
    commissionServicesCents,
    commissionProductsCents,
    tipsCents,
    tipsCashCents,
    tipsCardCents,
    bonusesPayoutCents,
    chairRentCents,
    facturadoCents,
    tierBonus,
    totalCents,
  }
}

/** True si el perfil está "configurado" (al menos un valor distinto de cero
 *  O salaryType no es null). Si no, no aparece en la vista de nóminas. */
export function isProfileConfigured(profile: BarberSalaryProfile): boolean {
  if (profile.salaryType) return true
  return (
    profile.salaryBaseCents > 0 ||
    profile.commissionServicesPct > 0 ||
    profile.commissionProductsPct > 0 ||
    profile.chairRentCents > 0 ||
    (profile.tierBonuses?.length ?? 0) > 0
  )
}
