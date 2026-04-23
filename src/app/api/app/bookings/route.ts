import { db } from '@/db'
import { bookings, clients } from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'

// -----------------------------------------------------------------------------
// GET /api/app/bookings?slug=...
//
// Returns the authenticated user's bookings. If `slug` is provided, scopes
// to that barbería; otherwise returns everything across barberías the user
// has ever booked (useful for a future "all my appointments" tab in the app).
// Sorted: upcoming first (earliest first), then past (newest first).
// -----------------------------------------------------------------------------

interface Row {
  id: string
  date: string
  time: string
  duration: number
  service: string
  barber: string | null
  status: string
  price: number | null
  clientBusinessName: string
  clientSlug: string | null
  clientBrandColor: string | null
}

export async function GET(req: Request) {
  const session = await getAppSession()
  if (!session) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')

  // When a slug is given we add a second filter on that client's id.
  let clientFilter: string | null = null
  if (slug) {
    const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
    if (!client) return Response.json({ bookings: [] })
    clientFilter = client.id
  }

  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      time: bookings.time,
      duration: bookings.duration,
      service: bookings.service,
      barber: bookings.barber,
      status: bookings.status,
      price: bookings.price,
      clientBusinessName: clients.businessName,
      clientSlug: clients.publicSlug,
      clientBrandColor: clients.brandColor,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      clientFilter
        ? and(eq(bookings.customerPhone, session.phone), eq(bookings.clientId, clientFilter))
        : eq(bookings.customerPhone, session.phone),
    )
    .orderBy(desc(bookings.date), desc(bookings.time))

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const upcoming: Row[] = []
  const past: Row[] = []
  for (const r of rows) {
    if (r.date >= today && (r.status === 'confirmed' || r.status === 'completed')) upcoming.push(r)
    else past.push(r)
  }
  upcoming.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  return Response.json({ upcoming, past })
}
