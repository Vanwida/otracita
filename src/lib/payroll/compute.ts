import type { BarberMonthRaw, BarberSalaryProfile, PayrollBreakdown, TierBonus } from './types'

// -----------------------------------------------------------------------------
// computeBarberPayroll — cálculo puro de la nómina mensual de UN barbero.
//
// Fórmula:
//   total = base
//         + servicios_facturados × (commissionServicesPct/100)
//         + productos_vendidos   × (commissionProductsPct/100)
//         + propinas (íntegras)
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
// -----------------------------------------------------------------------------

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return Math.round(n)
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
  if (!tierBonuses || tierBonuses.length === 0) return null
  if (!Number.isFinite(facturadoCents) || facturadoCents <= 0) return null
  // Saneamos + ordenamos. Mantenemos solo entradas con threshold finito ≥ 0.
  const clean: TierBonus[] = []
  for (const t of tierBonuses) {
    const threshold = Number.isFinite(t.thresholdCents) ? Math.max(0, Math.round(t.thresholdCents)) : NaN
    const bonus = Number.isFinite(t.bonusCents) ? Math.max(0, Math.round(t.bonusCents)) : NaN
    if (!Number.isFinite(threshold) || !Number.isFinite(bonus)) continue
    clean.push({ thresholdCents: threshold, bonusCents: bonus })
  }
  if (clean.length === 0) return null
  clean.sort((a, b) => a.thresholdCents - b.thresholdCents)
  let active: TierBonus | null = null
  for (const t of clean) {
    if (facturadoCents >= t.thresholdCents) active = t
    else break
  }
  return active
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
  const tipsCents = Math.max(0, Math.round(raw.tipsCents))
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

  const totalCents =
    base +
    commissionServicesCents +
    commissionProductsCents +
    tipsCents +
    bonusesPayoutCents +
    tierBonusCents -
    chairRentCents

  return {
    baseCents: base,
    commissionServicesCents,
    commissionProductsCents,
    tipsCents,
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
