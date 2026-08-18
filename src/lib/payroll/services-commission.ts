// -----------------------------------------------------------------------------
// R8 — comisión de servicios POR-SERVICIO (pure, testeable sin DB).
//
// La base Pro paga `servicesRevenueCents × globalPct`. Esta capa afina:
// si hay un override para (barbero, servicio) se usa ESE %, si no, el
// global del barbero. Se calcula servicio a servicio y se suma.
//
// Determinístico. Si un barbero no tiene NINGÚN override, el resultado es
// EXACTAMENTE `round(totalRevenueCents × globalPct/100)` — idéntico al
// camino histórico (no-regresión: compute.ts sigue usando el global
// cuando este override no se le pasa).
// -----------------------------------------------------------------------------

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 100) return 100
  return Math.round(n)
}

/** Facturación de servicios de UN barbero, partida por nombre de servicio.
 *  `revenueCents` en cents (viene tal cual de bookings.price_cents). */
export interface ServiceRevenueRow {
  serviceName: string
  revenueCents: number
}

/** Override puntual: "este barbero cobra `pct`% en este servicio". */
export interface ServiceCommissionOverride {
  serviceName: string
  pct: number
}

/**
 * Comisión total de servicios del barbero aplicando overrides por-servicio
 * y cayendo al % global para los servicios sin override.
 *
 * El match de nombre es exacto pero case-insensitive + trim — `bookings.service`
 * es texto libre y el catálogo es jsonb sin ID, mismo criterio que loyalty.
 */
export function computeServicesCommissionCents(args: {
  rows: ServiceRevenueRow[]
  overrides: ServiceCommissionOverride[]
  globalPct: number
}): number {
  const g = clampPct(args.globalPct)
  const overrideMap = new Map<string, number>()
  for (const o of args.overrides) {
    overrideMap.set(o.serviceName.trim().toLowerCase(), clampPct(o.pct))
  }

  let total = 0
  for (const row of args.rows) {
    const key = row.serviceName.trim().toLowerCase()
    const pct = overrideMap.has(key) ? (overrideMap.get(key) as number) : g
    total += Math.round(row.revenueCents * (pct / 100))
  }
  return total
}
