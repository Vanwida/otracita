import type { BarberSalaryProfile, SalaryType, TierBonus } from './types'

// -----------------------------------------------------------------------------
// Presets para el formulario "Cómo cobra" en BarbersManager.
//
// Son ATAJOS, no jaulas: el dueño puede sobrescribir cualquier campo después
// de elegir un preset. Sirven para bajar la barrera mental de "campo vacío".
//
// Cifras de referencia (no obligatorias):
//   · Fijo: salario base del convenio peluquerías 2026 (Grupo I = 1.250 €/mes)
//   · Mixto: convenio mínimo + 25% de comisión sobre servicios + 10% productos
//   · Autónomo: sin base, 60% sobre servicios, 30% productos, alquiler 150€
//   · F1 salaried_with_tier_bonus: base + 3 tramos por facturación (ejemplo
//     real Reni: 1.350 € + 100/250/350 € al alcanzar 4k/5k/6k €). Solo se
//     paga el bono del tramo MÁS ALTO alcanzado.
//
// El dueño debe revisar y ajustar según SU realidad — los números son sólo
// puntos de partida razonables para que no tenga que pensar desde cero.
// -----------------------------------------------------------------------------

const TIER_BONUS_EXAMPLE: TierBonus[] = [
  { thresholdCents: 400000, bonusCents: 10000 },   // 4.000 € → +100 €
  { thresholdCents: 500000, bonusCents: 25000 },   // 5.000 € → +250 €
  { thresholdCents: 600000, bonusCents: 35000 },   // 6.000 € → +350 €
]

export const SALARY_PRESETS: Record<SalaryType, Omit<BarberSalaryProfile, 'salaryType'> & { label: string; description: string }> = {
  fijo: {
    label: 'Asalariado',
    description: 'Sueldo fijo mensual sin variable. Mínimo legal según convenio.',
    salaryBaseCents: 125000,           // 1.250 € — convenio Grupo I 2026
    commissionServicesPct: 0,
    commissionProductsPct: 0,
    chairRentCents: 0,
    tierBonuses: null,
  },
  mixto: {
    label: 'Mixto (base + comisión)',
    description: 'Base mensual garantizada + porcentaje sobre lo que factura.',
    salaryBaseCents: 125000,           // base convenio
    commissionServicesPct: 25,
    commissionProductsPct: 10,
    chairRentCents: 0,
    tierBonuses: null,
  },
  autonomo: {
    label: 'Autónomo (alquiler de silla)',
    description: 'Trabaja por su cuenta, paga cuota fija al local y se queda un % alto de lo que factura.',
    salaryBaseCents: 0,
    commissionServicesPct: 60,
    commissionProductsPct: 30,
    chairRentCents: 15000,             // 150 €/mes
    tierBonuses: null,
  },
  salaried_with_tier_bonus: {
    label: 'Asalariado + bono por tramos',
    description: 'Base mensual fija + un bono extra al alcanzar ciertos niveles de facturación. Solo se paga el bono del tramo más alto alcanzado.',
    salaryBaseCents: 135000,           // 1.350 € (ejemplo Reni)
    commissionServicesPct: 0,
    commissionProductsPct: 0,
    chairRentCents: 0,
    tierBonuses: TIER_BONUS_EXAMPLE,
  },
}

export function presetLabel(type: SalaryType | null): string {
  if (!type) return 'Sin configurar'
  return SALARY_PRESETS[type].label
}
