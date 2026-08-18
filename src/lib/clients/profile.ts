import 'server-only'
import { db } from '@/db'
import { customers, bookings, ratings, tips, loyaltyLedger } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { canonicalPhone } from '@/lib/phone'

// -----------------------------------------------------------------------------
// loadClientProfile — FUENTE ÚNICA de la ficha de un cliente (fix #1).
//
// Antes la query vivía inline en /dashboard/clientes/[id]/page.tsx. Ahora
// la consumen TRES sitios sin duplicar nada:
//   1. La ruta /dashboard/clientes/[id] (server component).
//   2. /api/customers/[id]/profile (para abrir la ficha desde la agenda).
//   3. Cualquier sitio donde se clique un cliente.
//
// Devuelve un shape serializable (fechas → ISO) para poder mandarlo tal
// cual por JSON al panel de la agenda. El componente <ClientProfile> es
// presentación pura sobre este shape — cero lógica de datos en la UI.
//
// Multi-tenancy: SIEMPRE se filtra por clientId del barbero autenticado
// (el caller lo resuelve por sesión / requireClientAccess). El customer
// se localiza por id O por teléfono (la agenda solo tiene el teléfono).
// -----------------------------------------------------------------------------

export interface ClientProfileBooking {
  id: string
  date: string
  time: string
  service: string
  barber: string | null
  status: string
  /** CÉNTIMOS (bookings.price_cents). null = cita sin importe. */
  priceCents: number | null
}

export interface ClientProfileRating {
  id: string
  rating: number
  comment: string | null
  barberName: string | null
  createdAt: string
}

export interface ClientProfileAttributionBooking {
  id: string
  date: string
  referrerSource: string | null
  referrerCampaign: string | null
}

export interface ClientProfileData {
  customer: {
    id: string
    phone: string
    name: string | null
    email: string | null
    reputation: 'good' | 'warning' | 'blocked'
    noShows: number
    barberNotes: string | null
    createdAt: string
    firstSource: string | null
    firstSourceCampaign: string | null
    firstSourceCapturedAt: string | null
  }
  stats: {
    /** Total gastado en servicios completados, en CÉNTIMOS. */
    spentCents: number
    completedCount: number
    /** Propinas pagadas, en CÉNTIMOS. */
    tipsCents: number
    avgRating: number | null
    ratingCount: number
    /** Ticket medio = spentCents / completedCount, en CÉNTIMOS. */
    avgTicketCents: number
    loyaltyBalance: number
  }
  /**
   * Contador de citas por estado — la fila superior de la ficha de Booksy
   * (10.04.36/.46): TOTAL · COMPLETADAS · CANCELADAS · INASISTENCIAS. Se
   * deriva de `bookings` (no de los contadores denormalizados de
   * customers) para ser coherente con el split Próximas/Pasadas, que usa
   * la misma fuente. `total` = todas las citas registradas (cualquier
   * estado). Es paridad calcada de Booksy, no inventa dato nuevo.
   */
  counters: {
    total: number
    completed: number
    cancelled: number
    noShow: number
  }
  /** Modo de fidelidad del tenant: 'points' | 'stamps' | null (desactivado). */
  loyaltyMode: 'points' | 'stamps' | null
  topService: string | null
  topBarber: string | null
  bookings: ClientProfileBooking[]
  ratings: ClientProfileRating[]
  recentAttribution: ClientProfileAttributionBooking[]
}

function topByCount<T>(items: T[]): T | null {
  if (items.length === 0) return null
  const counts = new Map<T, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  let max: T | null = null
  let maxCount = 0
  for (const [k, v] of counts) {
    if (v > maxCount) {
      max = k
      maxCount = v
    }
  }
  return max
}

interface LoadOpts {
  /** id de la fila customers (ruta /clientes/[id]). */
  customerId?: string
  /** teléfono (la agenda no tiene el id, solo el teléfono). */
  phone?: string
  /** Modo de fidelidad del tenant para pintar saldo en sellos/puntos. */
  loyaltyEnabled: boolean
  loyaltyMode: 'points' | 'stamps' | null
}

/**
 * Carga la ficha completa. `null` si el customer no existe o no pertenece
 * al tenant (nunca distinguimos 403 de 404 — no revelamos existencia).
 */
export async function loadClientProfile(
  clientId: string,
  opts: LoadOpts,
): Promise<ClientProfileData | null> {
  // Look up by id, or by phone in its canonical E.164 form so the agenda
  // (which passes a booking's phone) resolves the same row regardless of
  // the format that booking was created with. Idempotent for already-
  // canonical input; keeps raw for unparseable (consistent with storage).
  const phoneKey = opts.phone ? canonicalPhone(opts.phone) : undefined
  const where = opts.customerId
    ? and(eq(customers.id, opts.customerId), eq(customers.clientId, clientId))
    : phoneKey
      ? and(eq(customers.phone, phoneKey), eq(customers.clientId, clientId))
      : null
  if (!where) return null

  const [customer] = await db.select().from(customers).where(where)
  if (!customer) return null

  // Stats agregadas + bookings + ratings + loyalty en paralelo. Idéntico
  // al que estaba inline en la página (mismo SQL, mismo orden).
  const [statsRow, bookingRows, ratingRows, loyaltyRow] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(price_cents), 0) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'completed')::bigint AS spent_cents,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'completed')::int AS completed_count,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone})::int AS total_count,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'cancelled')::int AS cancelled_count,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'no_show')::int AS no_show_count,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM ${tips}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'paid')::bigint AS tips_cents,
        (SELECT AVG(rating)::float FROM ${ratings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}) AS avg_rating,
        (SELECT COUNT(*) FROM ${ratings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone})::int AS rating_count
    `),
    db
      .select()
      .from(bookings)
      .where(and(eq(bookings.clientId, clientId), eq(bookings.customerPhone, customer.phone)))
      .orderBy(desc(bookings.date), desc(bookings.time))
      .limit(50),
    db
      .select()
      .from(ratings)
      .where(and(eq(ratings.clientId, clientId), eq(ratings.customerPhone, customer.phone)))
      .orderBy(desc(ratings.createdAt)),
    db
      .select({ balance: sql<number>`COALESCE(SUM(${loyaltyLedger.delta}), 0)` })
      .from(loyaltyLedger)
      .where(and(eq(loyaltyLedger.clientId, clientId), eq(loyaltyLedger.customerId, customer.id)))
      .then((rows) => rows[0]),
  ])

  const stats = (statsRow as unknown as {
    rows: Array<{
      spent_cents: number | string
      completed_count: number
      total_count: number
      cancelled_count: number
      no_show_count: number
      tips_cents: number | string
      avg_rating: number | null
      rating_count: number
    }>
  }).rows[0]

  const spentCents = Number(stats?.spent_cents ?? 0)
  const completedCount = Number(stats?.completed_count ?? 0)
  const tipsCents = Number(stats?.tips_cents ?? 0)
  const avgRating =
    stats?.avg_rating !== null && stats?.avg_rating !== undefined
      ? Number(stats.avg_rating)
      : null
  const ratingCount = Number(stats?.rating_count ?? 0)
  const avgTicketCents = completedCount > 0 ? Math.round(spentCents / completedCount) : 0
  const loyaltyBalance = Number(loyaltyRow?.balance ?? 0)

  // Contador de Booksy (10.04.36/.46) — derivado de bookings, misma
  // fuente que el split Próximas/Pasadas (coherencia garantizada).
  const counters = {
    total: Number(stats?.total_count ?? 0),
    completed: completedCount,
    cancelled: Number(stats?.cancelled_count ?? 0),
    noShow: Number(stats?.no_show_count ?? 0),
  }

  const topService = topByCount(
    bookingRows
      .filter((b) => b.status !== 'cancelled' && b.status !== 'no_show')
      .map((b) => b.service),
  )
  const topBarber = topByCount(
    bookingRows
      .filter((b) => b.status !== 'cancelled' && b.status !== 'no_show')
      .map((b) => b.barber)
      .filter((n): n is string => n !== null && n.trim().length > 0),
  )

  return {
    customer: {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      email: customer.email,
      reputation:
        (customer.reputation as 'good' | 'warning' | 'blocked' | null) ?? 'good',
      noShows: customer.noShows ?? 0,
      barberNotes: customer.barberNotes,
      createdAt: customer.createdAt.toISOString(),
      firstSource: customer.firstSource,
      firstSourceCampaign: customer.firstSourceCampaign,
      firstSourceCapturedAt: customer.firstSourceCapturedAt
        ? customer.firstSourceCapturedAt.toISOString()
        : null,
    },
    stats: {
      spentCents,
      completedCount,
      tipsCents,
      avgRating,
      ratingCount,
      avgTicketCents,
      loyaltyBalance,
    },
    counters,
    loyaltyMode: opts.loyaltyEnabled ? opts.loyaltyMode : null,
    topService,
    topBarber,
    bookings: bookingRows.map((b) => ({
      id: b.id,
      date: b.date,
      time: b.time,
      service: b.service,
      barber: b.barber,
      status: b.status,
      priceCents: b.priceCents,
    })),
    ratings: ratingRows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      barberName: r.barberName,
      createdAt: r.createdAt.toISOString(),
    })),
    recentAttribution: bookingRows.slice(0, 5).map((b) => ({
      id: b.id,
      date: b.date,
      referrerSource: b.referrerSource,
      referrerCampaign: b.referrerCampaign,
    })),
  }
}
