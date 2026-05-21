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

/** Datos brutos del mes para UN barbero, ya filtrados/agregados desde DB.
 *
 *  R-T3 (Reni V1 Parte 2) — `tipsCents` se mantiene como SUMA total para
 *  compat retro (UI antigua / informes); el split en cash/card vive en los
 *  campos dedicados. Reglas:
 *    · CASH = el barbero ya cobró en mano al cliente (self-liquidated).
 *      NO entra al "total a pagar" del local — ya está en su bolsillo.
 *    · CARD = pendiente de pagar al barbero en la nómina del mes.
 *      Entra al total a pagar como ha sido siempre.
 *    · Legacy (payment_method NULL en DB) ⇒ contar como CARD implícito.
 *
 *  Invariante: `tipsCents === tipsCashCents + tipsCardCents` siempre. Los
 *  callers que rellenan `tipsCents` directo (sin split) DEBEN tratarse como
 *  card (compat retro — todas las propinas pre-V1 eran Stripe Checkout =
 *  card). El motor lo enforza vía `normalizeTipsSplit` en compute.ts. */
export interface BarberMonthRaw {
  servicesRevenueCents: number       // SUM(bookings.price * 100) WHERE barberId
  productsRevenueCents: number       // SUM(product_sales.amount_cents) WHERE barberId
  tipsCents: number                   // SUM(tips.amount_cents) — total informativo
  /** Propinas CASH (ya entregadas en mano al barbero). Informativo en nómina
   *  — NO se suman al total a pagar. Opcional para compat retro. */
  tipsCashCents?: number
  /** Propinas CARD (pendientes de pagar al barbero vía nómina). Entran al
   *  total a pagar. Opcional: si no se pasa, se asume == tipsCents (todo
   *  card, comportamiento pre-V1). */
  tipsCardCents?: number
  bonusesPayoutCents: number          // Suma de recompensas de bonos que ESE barbero alcanzó
}

/** Desglose de la nómina del mes — todas las piezas + total neto. */
export interface PayrollBreakdown {
  baseCents: number
  commissionServicesCents: number
  commissionProductsCents: number
  /** Total de propinas del mes (cash + card). Informativo. */
  tipsCents: number
  /** R-T3 — Propinas CASH (ya entregadas en mano). NO entran al `totalCents`. */
  tipsCashCents: number
  /** R-T3 — Propinas CARD (pendientes pago vía nómina). SÍ entran al `totalCents`. */
  tipsCardCents: number
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
