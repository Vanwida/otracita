import { db } from '@/db'
import { bookings as bookingsTable, customers as customersTable, promoPushes } from '@/db/schema'
import { sql } from 'drizzle-orm'
import {
  LOYAL_VISITS_THRESHOLD,
  LOYAL_VISITS_WINDOW_DAYS,
  RECENT_VISIT_COOLDOWN_DAYS,
  NO_SHOW_EXCLUDE_THRESHOLD,
  RATE_LIMIT_DAYS,
} from './defaults'

// -----------------------------------------------------------------------------
// "Cliente fiel elegible" para una promo contextual.
//
// Filtros aplicados (todos AND):
//   1. Pertenece a esta barbería (clientId match)
//   2. Tiene >= LOYAL_VISITS_THRESHOLD visitas no canceladas en últimos
//      LOYAL_VISITS_WINDOW_DAYS días.
//   3. Última visita hace >= RECENT_VISIT_COOLDOWN_DAYS (no spamear al
//      que vino ayer — todavía está "fresco").
//   4. noShows < NO_SHOW_EXCLUDE_THRESHOLD (no premiamos faltones).
//   5. reputation != 'blocked' (cliente bloqueado por el barbero).
//   6. No tiene reserva confirmada/completed en próximos 7 días (ya viene).
//   7. No le hemos mandado promo en últimos RATE_LIMIT_DAYS días.
//
// Devuelve la lista ordenada por última visita desc (los más vivos primero).
// -----------------------------------------------------------------------------

export interface EligibleCustomer {
  phone: string
  name: string | null
  totalRecentVisits: number
  lastBookingAt: Date | null
}

export async function findEligibleCustomers(clientId: string): Promise<EligibleCustomer[]> {
  // Single SQL query — todo el filtro vive en SQL para evitar bajar miles
  // de filas. Las condiciones más selectivas primero.
  //
  // visits_recent = COUNT bookings (no cancelled) en últimos 90 días.
  // last_booking = MAX createdAt entre esos.
  // upcoming = bool, tiene reserva confirmed/completed en próximos 7 días.
  // last_promo = MAX createdAt en promo_pushes para este (clientId, phone).
  const todayMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })

  const rows = await db.execute(sql`
    WITH recent_visits AS (
      SELECT
        c.id, c.phone, c.name, c.no_shows, c.reputation,
        COUNT(b.id) FILTER (
          WHERE b.status != 'cancelled'
            AND b.date >= (CURRENT_DATE - INTERVAL '${sql.raw(String(LOYAL_VISITS_WINDOW_DAYS))} days')::text
        ) AS recent_count,
        MAX(b.date) FILTER (WHERE b.status != 'cancelled') AS last_visit_date
      FROM ${customersTable} c
      LEFT JOIN ${bookingsTable} b
        ON b.client_id = c.client_id AND b.customer_phone = c.phone
      WHERE c.client_id = ${clientId}
      GROUP BY c.id, c.phone, c.name, c.no_shows, c.reputation
    ),
    upcoming AS (
      SELECT DISTINCT customer_phone FROM ${bookingsTable}
      WHERE client_id = ${clientId}
        AND date >= ${todayMadrid}
        AND date < (CURRENT_DATE + INTERVAL '8 days')::text
        AND status IN ('confirmed', 'completed')
    ),
    last_promos AS (
      SELECT customer_phone, MAX(created_at) AS last_promo_at
      FROM ${promoPushes}
      WHERE client_id = ${clientId}
      GROUP BY customer_phone
    )
    SELECT
      rv.phone,
      rv.name,
      rv.recent_count,
      rv.last_visit_date,
      lp.last_promo_at
    FROM recent_visits rv
    LEFT JOIN upcoming u ON u.customer_phone = rv.phone
    LEFT JOIN last_promos lp ON lp.customer_phone = rv.phone
    WHERE rv.recent_count >= ${LOYAL_VISITS_THRESHOLD}
      AND COALESCE(rv.no_shows, 0) < ${NO_SHOW_EXCLUDE_THRESHOLD}
      AND COALESCE(rv.reputation, 'good') != 'blocked'
      AND u.customer_phone IS NULL
      AND rv.last_visit_date IS NOT NULL
      AND rv.last_visit_date <= (CURRENT_DATE - INTERVAL '${sql.raw(String(RECENT_VISIT_COOLDOWN_DAYS))} days')::text
      AND (lp.last_promo_at IS NULL OR lp.last_promo_at < now() - INTERVAL '${sql.raw(String(RATE_LIMIT_DAYS))} days')
    ORDER BY rv.last_visit_date DESC NULLS LAST
  `)

  // drizzle's execute returns { rows: [...] }
  const records = (rows as unknown as { rows: Array<{ phone: string; name: string | null; recent_count: string | number; last_visit_date: string | null }> }).rows
  return records.map((r) => ({
    phone: r.phone,
    name: r.name,
    totalRecentVisits: Number(r.recent_count) || 0,
    lastBookingAt: r.last_visit_date ? new Date(`${r.last_visit_date}T00:00:00`) : null,
  }))
}
