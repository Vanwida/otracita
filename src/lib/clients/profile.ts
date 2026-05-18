import 'server-only'
import { db } from '@/db'
import { customers, bookings, ratings, tips, loyaltyLedger } from '@/db/schema'
import { eq, and, desc, sql } from 'drizzle-orm'

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
  price: number | null
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
    spentEur: number
    completedCount: number
    tipsEur: number
    avgRating: number | null
    ratingCount: number
    avgTicketEur: number
    loyaltyBalance: number
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
  const where = opts.customerId
    ? and(eq(customers.id, opts.customerId), eq(customers.clientId, clientId))
    : opts.phone
      ? and(eq(customers.phone, opts.phone), eq(customers.clientId, clientId))
      : null
  if (!where) return null

  const [customer] = await db.select().from(customers).where(where)
  if (!customer) return null

  // Stats agregadas + bookings + ratings + loyalty en paralelo. Idéntico
  // al que estaba inline en la página (mismo SQL, mismo orden).
  const [statsRow, bookingRows, ratingRows, loyaltyRow] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT COALESCE(SUM(price), 0) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'completed')::bigint AS spent_eur,
        (SELECT COUNT(*) FROM ${bookings}
          WHERE client_id = ${clientId} AND customer_phone = ${customer.phone}
          AND status = 'completed')::int AS completed_count,
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
      spent_eur: number | string
      completed_count: number
      tips_cents: number | string
      avg_rating: number | null
      rating_count: number
    }>
  }).rows[0]

  const spentEur = Number(stats?.spent_eur ?? 0)
  const completedCount = Number(stats?.completed_count ?? 0)
  const tipsEur = Number(stats?.tips_cents ?? 0) / 100
  const avgRating =
    stats?.avg_rating !== null && stats?.avg_rating !== undefined
      ? Number(stats.avg_rating)
      : null
  const ratingCount = Number(stats?.rating_count ?? 0)
  const avgTicketEur = completedCount > 0 ? spentEur / completedCount : 0
  const loyaltyBalance = Number(loyaltyRow?.balance ?? 0)

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
      spentEur,
      completedCount,
      tipsEur,
      avgRating,
      ratingCount,
      avgTicketEur,
      loyaltyBalance,
    },
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
      price: b.price,
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
