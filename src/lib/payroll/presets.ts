import type { BarberSalaryProfile, SalaryType } from './types'

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
//
// El dueño debe revisar y ajustar según SU realidad — los números son sólo
// puntos de partida razonables para que no tenga que pensar desde cero.
// -----------------------------------------------------------------------------

export const SALARY_PRESETS: Record<SalaryType, Omit<BarberSalaryProfile, 'salaryType'> & { label: string; description: string }> = {
  fijo: {
    label: 'Asalariado',
    description: 'Sueldo fijo mensual sin variable. Mínimo legal según convenio.',
    salaryBaseCents: 125000,           // 1.250 € — convenio Grupo I 2026
    commissionServicesPct: 0,
    commissionProductsPct: 0,
    chairRentCents: 0,
  },
  mixto: {
    label: 'Mixto (base + comisión)',
    description: 'Base mensual garantizada + porcentaje sobre lo que factura.',
    salaryBaseCents: 125000,           // base convenio
    commissionServicesPct: 25,
    commissionProductsPct: 10,
    chairRentCents: 0,
  },
  autonomo: {
    label: 'Autónomo (alquiler de silla)',
    description: 'Trabaja por su cuenta, paga cuota fija al local y se queda un % alto de lo que factura.',
    salaryBaseCents: 0,
    commissionServicesPct: 60,
    commissionProductsPct: 30,
    chairRentCents: 15000,             // 150 €/mes
  },
}

export function presetLabel(type: SalaryType | null): string {
  if (!type) return 'Sin configurar'
  return SALARY_PRESETS[type].label
}
