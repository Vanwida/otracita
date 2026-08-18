import { db } from '@/db'
import { bookings, clients, customers } from '@/db/schema'
import { and, eq, or, sql } from 'drizzle-orm'
import { requireCron } from '@/lib/auth/require-cron'
import { computeBookingDelta } from '@/lib/loyalty/compute'
import type { LoyaltyConfig } from '@/lib/loyalty/types'

// -----------------------------------------------------------------------------
// GET /api/cron/loyalty-award
//
// Programado DIARIAMENTE a las 22:00 Europe/Madrid (después del followup
// cron de las 21:00, que usa la misma ventana de "service ended"). Para
// cada barbería con `loyaltyEnabled = true`, busca bookings que:
//   · status in ('confirmed', 'completed')  — no_show y cancelled no suman
//   · endsAt + 1 hora ≤ now()               — da tiempo a marcar no_show
//   · endsAt > now() - 48h                  — no resucitamos bookings antiguos
//   · No tienen ya una fila en loyalty_ledger con reason='booking_completed'
//
// Idempotencia: la DB tiene un índice UNIQUE parcial sobre
// (booking_id) WHERE reason='booking_completed'. Si el cron se dispara dos
// veces en el mismo día, las inserciones duplicadas fallan silenciosamente
// (ON CONFLICT DO NOTHING a nivel aplicación).
//
// Upsert-by-phone: si el booking tiene customerPhone pero no existe row en
// `customers` para ese tenant, la creamos al vuelo. Así nunca perdemos el
// award.
//
// DRY_RUN: env var LOYALTY_AWARD_DRY_RUN="true" lo activa (default OFF para
// producción). Si en algún incidente quisiéramos parar awards sin tocar
// código, basta con poner la env a "true" en Vercel.
// -----------------------------------------------------------------------------

const DRY_RUN = process.env.LOYALTY_AWARD_DRY_RUN === 'true'

const MAX_BATCH = 200

export async function GET(request: Request) {
  const unauth = requireCron(request)
  if (unauth) return unauth

  // endsAt en Madrid + 1h (margen para marcar no_show antes del award).
  const endsAtMadrid = sql<string>`((${bookings.date} || ' ' || ${bookings.time})::timestamp AT TIME ZONE 'Europe/Madrid') + (${bookings.duration} || ' minutes')::interval`
  const awardAt = sql<string>`${endsAtMadrid} + interval '1 hour'`

  const candidates = await db
    .select({ booking: bookings, client: clients })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        eq(clients.loyaltyEnabled, true),
        or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'completed')),
        sql`${awardAt} <= now()`,
        sql`${awardAt} > now() - interval '48 hours'`,
      ),
    )
    .limit(MAX_BATCH)

  let awarded = 0
  let skipped = 0
  let errors = 0

  const inspected: Array<{
    bookingId: string
    clientId: string
    delta: number
    outcome: 'awarded' | 'already_awarded' | 'zero_delta' | 'error'
  }> = []

  for (const { booking, client } of candidates) {
    const config = client.loyaltyConfig as unknown as LoyaltyConfig | null
    if (!config || typeof config !== 'object' || !('mode' in config)) {
      skipped++
      continue
    }

    const delta = computeBookingDelta(
      { priceEuros: booking.price, serviceName: booking.service },
      config,
    )
    if (delta <= 0) {
      skipped++
      inspected.push({
        bookingId: booking.id,
        clientId: client.id,
        delta: 0,
        outcome: 'zero_delta',
      })
      continue
    }

    if (DRY_RUN) {
      inspected.push({
        bookingId: booking.id,
        clientId: client.id,
        delta,
        outcome: 'awarded',
      })
      awarded++
      continue
    }

    try {
      // Upsert customer por (clientId, phone).
      const [existing] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.clientId, client.id),
            eq(customers.phone, booking.customerPhone),
          ),
        )
      let customerId: string
      if (existing) {
        customerId = existing.id
      } else {
        const [created] = await db
          .insert(customers)
          .values({
            clientId: client.id,
            phone: booking.customerPhone,
            name: booking.customerName ?? null,
            totalBookings: 1,
            reputation: 'good',
          })
          .returning({ id: customers.id })
        customerId = created.id
      }

      // Insert; idempotente gracias al UNIQUE parcial en (booking_id) WHERE reason='booking_completed'.
      // INFERENCIA POR ÍNDICE (columna + predicado), NO `ON CONFLICT ON CONSTRAINT`:
      // el objeto en DB es un UNIQUE INDEX parcial, no una constraint nombrada,
      // así que `ON CONSTRAINT <nombre>` lanzaba "constraint does not exist" en
      // cada insert (silenciado por el catch → 0 sellos otorgados nunca).
      const result = await db.execute(sql`
        INSERT INTO loyalty_ledger
          (client_id, customer_id, booking_id, delta, reason, note, reward_snapshot, created_by)
        VALUES
          (${client.id}, ${customerId}, ${booking.id}, ${delta}, 'booking_completed', NULL, NULL, 'system_cron')
        ON CONFLICT (booking_id) WHERE reason = 'booking_completed' DO NOTHING
        RETURNING id
      `)

      const inserted = (result as unknown as { rowCount?: number; rows?: unknown[] })
      const count = inserted.rowCount ?? inserted.rows?.length ?? 0
      if (count > 0) {
        awarded++
        inspected.push({
          bookingId: booking.id,
          clientId: client.id,
          delta,
          outcome: 'awarded',
        })
      } else {
        skipped++
        inspected.push({
          bookingId: booking.id,
          clientId: client.id,
          delta,
          outcome: 'already_awarded',
        })
      }
    } catch (err) {
      errors++
      inspected.push({
        bookingId: booking.id,
        clientId: client.id,
        delta,
        outcome: 'error',
      })
      console.error('[cron/loyalty-award] insert failed', booking.id, err)
    }
  }

  if (DRY_RUN) {
    console.log(
      `[cron/loyalty-award] DRY RUN — ${candidates.length} candidate(s), would award ${awarded}`,
      inspected,
    )
  }

  // Un insert que falla NO puede devolver 200. Ese fue exactamente el modo de
  // fallo de este cron: el ON CONFLICT reventaba con 42P10 en cada iteración,
  // el catch lo convertía en `errors++` y el endpoint respondía 200 con
  // awarded=0. Vercel lo veía verde y nadie se enteró durante meses. Seguimos
  // procesando el resto del lote (un booking roto no debe bloquear a los
  // demás), pero el status refleja que hubo fallos.
  if (errors > 0) {
    console.error(
      `[cron/loyalty-award] ${errors} de ${candidates.length} candidato(s) fallaron — awarded=${awarded}`,
    )
  }

  return Response.json(
    {
      dryRun: DRY_RUN,
      candidateCount: candidates.length,
      awarded,
      skipped,
      errors,
      inspected: DRY_RUN ? inspected : undefined,
    },
    { status: errors > 0 ? 500 : 200 },
  )
}
