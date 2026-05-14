// -----------------------------------------------------------------------------
// Tipos compartidos del módulo de nóminas. Aislados para que los importen
// tanto el cálculo puro como las APIs/UI sin acoplar lo demás.
// -----------------------------------------------------------------------------

/** Preset elegido por el dueño al configurar el pago del barbero. Solo
 *  informativo — el cálculo siempre usa los 4 valores numéricos. Null
 *  significa "sin configurar" → no aparece en /finanzas/nóminas. */
export type SalaryType = 'fijo' | 'mixto' | 'autonomo'

export interface BarberSalaryProfile {
  salaryType: SalaryType | null
  salaryBaseCents: number
  commissionServicesPct: number      // 0-100
  commissionProductsPct: number      // 0-100
  chairRentCents: number              // RESTA — lo que el barbero paga al local
}

/** Datos brutos del mes para UN barbero, ya filtrados/agregados desde DB. */
export interface BarberMonthRaw {
  servicesRevenueCents: number       // SUM(bookings.price * 100) WHERE barberId
  productsRevenueCents: number       // SUM(product_sales.amount_cents) WHERE barberId
  tipsCents: number                   // SUM(tips.amount_cents) WHERE barberId, paid
  bonusesPayoutCents: number          // Suma de recompensas de bonos que ESE barbero alcanzó
}

/** Desglose de la nómina del mes — todas las piezas + total neto. */
export interface PayrollBreakdown {
  baseCents: number
  commissionServicesCents: number
  commissionProductsCents: number
  tipsCents: number
  bonusesPayoutCents: number
  chairRentCents: number             // RESTA (entra como negativo en el total)
  totalCents: number                 // suma neta
}
