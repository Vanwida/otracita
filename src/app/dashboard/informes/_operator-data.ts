import 'server-only'

import { db } from '@/db'
import { bookings, productSales, tips } from '@/db/schema'
import { sql } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// _operator-data — agregaciones del Panel del operador (la lectura de 10
// segundos: "abro Informes y entiendo mi negocio").
//
// PURA AGREGACIÓN sobre tablas EXISTENTES (bookings/product_sales/tips). Cero
// schema nuevo. Multi-tenancy: el caller resuelve `clientId` de la sesión
// (informes/page.tsx, patrón intacto) — aquí nunca llega del request.
//
// Convenio de importes: `bookings.price` está en EUROS (foot-gun del schema,
// documentado en CLAUDE.md). `product_sales.total_cents` y `tips.amount_cents`
// en céntimos. Devolvemos todo en CÉNTIMOS para que la UI formatee con un
// único helper (coherencia con el resto de Informes / P&L).
//
// `month` (YYYY-MM) y sus bounds [start, end) los pasa el caller — son los
// MISMOS que usa el P&L (FinanzasClient navega por meses), así el Panel y el
// Detalle financiero hablan del mismo periodo sin drift.
// -----------------------------------------------------------------------------

export interface BookingStatusBreakdown {
  /** Estado canónico de bookings.status. */
  status: 'completed' | 'confirmed' | 'no_show' | 'cancelled'
  count: number
  /** % sobre el total de citas del periodo (0-100, redondeado). */
  pct: number
}

export interface OperatorMetrics {
  /** Ingresos del periodo en céntimos = servicios + productos + propinas. */
  ingresosTotalCents: number
  serviciosCents: number
  productosCents: number
  propinasCents: number
  /** Mismo total (serv+prod+prop) del periodo INMEDIATAMENTE anterior de
   *  igual tamaño, para la flecha de tendencia. null si no aplica. */
  prevIngresosTotalCents: number | null
  /** Desglose de citas por estado, orden fijo (completed→cancelled). */
  statusBreakdown: BookingStatusBreakdown[]
  totalCitas: number
  /** Clientes únicos atendidos (completed) en el periodo. */
  clientesNuevos: number
  clientesRecurrentes: number
  /** Serie ~12 meses de ingresos por servicios (céntimos) para sparkline. */
  trend: { month: string; cents: number }[]
}

const STATUS_ORDER: BookingStatusBreakdown['status'][] = [
  'completed',
  'confirmed',
  'no_show',
  'cancelled',
]

/**
 * Métricas del Panel del operador para [start, end). Una sola ida a DB
 * (un execute con sub-selects) + la serie de tendencia. Scoped por
 * `clientId` (resuelto de la sesión por el caller).
 */
export async function loadOperatorMetrics(
  clientId: string,
  start: string,
  end: string,
): Promise<OperatorMetrics> {
  // ── Bloque principal: ingresos por tipo + citas por estado + nuevos vs
  //    recurrentes. Sub-selects sobre el mismo rango — 1 round-trip.
  const [row] =
    (await db
      .execute(sql`
    SELECT
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'completed'
        AND date >= ${start} AND date < ${end})::bigint AS servicios_eur,
      (SELECT COALESCE(SUM(total_cents), 0) FROM ${productSales}
        WHERE client_id = ${clientId}
        AND sold_at >= ${start}::date AND sold_at < ${end}::date)::bigint AS productos_cents,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
        WHERE client_id = ${clientId} AND status = 'paid'
        AND paid_at >= ${start}::date AND paid_at < ${end}::date)::bigint AS propinas_cents,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'completed'
        AND date >= ${start} AND date < ${end})::int AS completed_count,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'confirmed'
        AND date >= ${start} AND date < ${end})::int AS confirmed_count,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'no_show'
        AND date >= ${start} AND date < ${end})::int AS no_show_count,
      (SELECT COUNT(*) FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'cancelled'
        AND date >= ${start} AND date < ${end})::int AS cancelled_count,
      -- Nuevos vs recurrentes: un cliente (customer_phone) es NUEVO si su
      -- primera cita completada de SIEMPRE cae dentro del periodo; si su
      -- primera completada fue antes, es recurrente. Calculado sobre los
      -- phones con ≥1 completada en el rango.
      (SELECT COUNT(*) FROM (
        SELECT customer_phone, MIN(date) AS first_date
        FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'completed'
        GROUP BY customer_phone
        HAVING MAX(CASE WHEN date >= ${start} AND date < ${end} THEN 1 ELSE 0 END) = 1
      ) q WHERE first_date >= ${start} AND first_date < ${end})::int AS clientes_nuevos,
      (SELECT COUNT(*) FROM (
        SELECT customer_phone, MIN(date) AS first_date
        FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'completed'
        GROUP BY customer_phone
        HAVING MAX(CASE WHEN date >= ${start} AND date < ${end} THEN 1 ELSE 0 END) = 1
      ) q WHERE first_date < ${start})::int AS clientes_recurrentes
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                servicios_eur: string | number
                productos_cents: string | number
                propinas_cents: string | number
                completed_count: number
                confirmed_count: number
                no_show_count: number
                cancelled_count: number
                clientes_nuevos: number
                clientes_recurrentes: number
              }[]
            }
          ).rows,
      )) ?? []

  const serviciosCents = Math.round(Number(row?.servicios_eur ?? 0) * 100)
  const productosCents = Number(row?.productos_cents ?? 0)
  const propinasCents = Number(row?.propinas_cents ?? 0)

  // ── Periodo anterior comparable: misma duración inmediatamente antes de
  //    [start, end). Mismo total (serv+prod+prop) para la tendencia — así
  //    el % compara manzanas con manzanas (no servicios vs total).
  const prevDays = Math.max(
    1,
    Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
    ),
  )
  const prevEnd = start
  const prevStart = new Date(
    new Date(start).getTime() - prevDays * 86400000,
  )
    .toISOString()
    .slice(0, 10)

  const [prevRow] =
    (await db
      .execute(sql`
    SELECT
      (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
        WHERE client_id = ${clientId} AND status = 'completed'
        AND date >= ${prevStart} AND date < ${prevEnd})::bigint AS servicios_eur,
      (SELECT COALESCE(SUM(total_cents), 0) FROM ${productSales}
        WHERE client_id = ${clientId}
        AND sold_at >= ${prevStart}::date AND sold_at < ${prevEnd}::date)::bigint AS productos_cents,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
        WHERE client_id = ${clientId} AND status = 'paid'
        AND paid_at >= ${prevStart}::date AND paid_at < ${prevEnd}::date)::bigint AS propinas_cents
  `)
      .then(
        (r) =>
          (
            r as unknown as {
              rows: {
                servicios_eur: string | number
                productos_cents: string | number
                propinas_cents: string | number
              }[]
            }
          ).rows,
      )) ?? []

  const prevIngresosTotalCents = prevRow
    ? Math.round(Number(prevRow.servicios_eur) * 100) +
      Number(prevRow.productos_cents) +
      Number(prevRow.propinas_cents)
    : null

  const counts: Record<BookingStatusBreakdown['status'], number> = {
    completed: Number(row?.completed_count ?? 0),
    confirmed: Number(row?.confirmed_count ?? 0),
    no_show: Number(row?.no_show_count ?? 0),
    cancelled: Number(row?.cancelled_count ?? 0),
  }
  const totalCitas =
    counts.completed + counts.confirmed + counts.no_show + counts.cancelled

  const statusBreakdown: BookingStatusBreakdown[] = STATUS_ORDER.map((s) => ({
    status: s,
    count: counts[s],
    pct: totalCitas > 0 ? Math.round((counts[s] / totalCitas) * 100) : 0,
  }))

  // ── Serie de tendencia: ingresos por servicios de los últimos 12 meses
  //    (incluido el actual), agrupados por mes. date es texto YYYY-MM-DD.
  const trendRows =
    (await db
      .execute(sql`
    SELECT to_char(date::date, 'YYYY-MM') AS ym,
           COALESCE(SUM(price), 0)::bigint AS eur
    FROM ${bookings}
    WHERE client_id = ${clientId} AND status = 'completed'
      AND date::date >= (${end}::date - INTERVAL '12 months')
      AND date < ${end}
    GROUP BY ym
    ORDER BY ym ASC
  `)
      .then(
        (r) =>
          (r as unknown as { rows: { ym: string; eur: string | number }[] })
            .rows,
      )) ?? []

  const trend = trendRows.map((t) => ({
    month: t.ym,
    cents: Math.round(Number(t.eur) * 100),
  }))

  return {
    ingresosTotalCents: serviciosCents + productosCents + propinasCents,
    serviciosCents,
    productosCents,
    propinasCents,
    prevIngresosTotalCents,
    statusBreakdown,
    totalCitas,
    clientesNuevos: Number(row?.clientes_nuevos ?? 0),
    clientesRecurrentes: Number(row?.clientes_recurrentes ?? 0),
    trend,
  }
}
