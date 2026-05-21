// -----------------------------------------------------------------------------
// Tipos compartidos del módulo de nóminas. Aislados para que los importen
// tanto el cálculo puro como las APIs/UI sin acoplar lo demás.
// -----------------------------------------------------------------------------

/** Preset elegido por el dueño al configurar el pago del barbero. Solo
 *  informativo — el cálculo siempre usa los 4 valores numéricos + tramos.
 *  Null significa "sin configurar" → no aparece en /finanzas/nóminas.
 *
 *  F1: 'salaried_with_tier_bonus' añade base + UN bono del tramo más alto
 *  alcanzado por facturación del barbero en el periodo. Es ortogonal al
 *  módulo R9 de "bonos por actividades" (reseñas, ventas) — esos siguen
 *  sumándose aparte vía `bonusesPayoutCents`. */
export type SalaryType =
  | 'fijo'
  | 'mixto'
  | 'autonomo'
  | 'salaried_with_tier_bonus'

/** F1 — Un tramo de bono por facturación. El bono se aplica si el barbero
 *  alcanza `thresholdCents` de facturación en el periodo. Solo se paga el
 *  bono del tramo MÁS ALTO alcanzado (no acumulativo). */
export interface TierBonus {
  thresholdCents: number    // Facturación mínima para activar este tramo
  bonusCents: number         // Bono a pagar si se alcanza
}

export interface BarberSalaryProfile {
  salaryType: SalaryType | null
  salaryBaseCents: number
  commissionServicesPct: number      // 0-100
  commissionProductsPct: number      // 0-100
  chairRentCents: number              // RESTA — lo que el barbero paga al local
  /** F1 — Tramos del nuevo preset. null o [] ⇒ sin bono por tramo (cero).
   *  Solo se evalúa cuando salaryType === 'salaried_with_tier_bonus' (el
   *  motor lo ignora para los otros tipos, evitando regresiones). */
  tierBonuses: TierBonus[] | null
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
  /** F1 — Facturación total considerada para evaluar tramos (servicios +
   *  productos, sin tips). Es informativo para la UI ("alcanzaste 5.500 €").
   *  Para perfiles que NO usan tramos, vale igualmente la suma (no se usa
   *  en el cálculo). */
  facturadoCents: number
  /** F1 — Tramo de bono activado (el más alto alcanzado), o null si el
   *  barbero no llegó al primer threshold o no usa este tipo de salario.
   *  El importe ya está sumado en `totalCents`. */
  tierBonus: TierBonus | null
  totalCents: number                 // suma neta
}
