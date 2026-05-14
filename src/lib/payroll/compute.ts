import type { BarberMonthRaw, BarberSalaryProfile, PayrollBreakdown } from './types'

// -----------------------------------------------------------------------------
// computeBarberPayroll — cálculo puro de la nómina mensual de UN barbero.
//
// Fórmula:
//   total = base
//         + servicios_facturados × (commissionServicesPct/100)
//         + productos_vendidos   × (commissionProductsPct/100)
//         + propinas (íntegras)
//         + bonos_cobrados
//         − alquiler_silla
//
// Todo en cents. Inputs/outputs determinísticos para tests.
//
// Defensivo: percentages se capean a [0, 100] por si entra un valor raro
// desde la API (que ya valida, pero belt-and-braces).
// -----------------------------------------------------------------------------

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return Math.round(n)
}

export function computeBarberPayroll(
  profile: BarberSalaryProfile,
  raw: BarberMonthRaw,
): PayrollBreakdown {
  const base = Math.max(0, Math.round(profile.salaryBaseCents))
  const commissionServicesCents = Math.round(
    raw.servicesRevenueCents * (clampPct(profile.commissionServicesPct) / 100),
  )
  const commissionProductsCents = Math.round(
    raw.productsRevenueCents * (clampPct(profile.commissionProductsPct) / 100),
  )
  const tipsCents = Math.max(0, Math.round(raw.tipsCents))
  const bonusesPayoutCents = Math.max(0, Math.round(raw.bonusesPayoutCents))
  const chairRentCents = Math.max(0, Math.round(profile.chairRentCents))

  const totalCents =
    base +
    commissionServicesCents +
    commissionProductsCents +
    tipsCents +
    bonusesPayoutCents -
    chairRentCents

  return {
    baseCents: base,
    commissionServicesCents,
    commissionProductsCents,
    tipsCents,
    bonusesPayoutCents,
    chairRentCents,
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
    profile.chairRentCents > 0
  )
}
