import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { getAvailableSlotsFromDB } from '@/lib/availability'
import type { BarberConfig } from '@/lib/whatsapp/config'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// GET /api/public/availability/grid?slug=...&service=...&date=YYYY-MM-DD
//
// Returns a Booksy-style availability grid for a single date: for each
// active barber we list their free slots, plus the UNION ("cualquiera
// disponible"). The /b/[slug] UI uses this to:
//   · Grey out barber circles that have zero slots that day.
//   · Show the hour chips depending on who's selected.
//
// One call per (service, date) replaces N calls per barber → faster feel
// and cheaper on Neon.
// -----------------------------------------------------------------------------

interface Service {
  name: string
  duration: number
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon'
  )
}

export async function GET(req: Request) {
  const limit = checkRateLimit(`public-grid:${clientIp(req)}`, 90)
  if (!limit.ok) return rateLimitResponse(limit)

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')
  const service = url.searchParams.get('service')
  const date = url.searchParams.get('date')

  if (!slug || !service || !date)
    return Response.json({ error: 'slug, service y date son obligatorios' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: 'date inválido' }, { status: 400 })

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled)
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })

  const services = (client.chatbotServices as Service[] | null) || []
  const matched = services.find((s) => s?.name?.toLowerCase() === service.toLowerCase())
  if (!matched) return Response.json({ error: 'Servicio no encontrado' }, { status: 404 })

  const barberRows = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, client.id), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name))
  const barbers: BarberConfig[] = barberRows.map((b) => ({
    id: b.id,
    name: b.name,
    hours: (b.hours as Record<string, string> | null) ?? null,
    blockedDates: (b.blockedDates as string[]) ?? [],
    displayOrder: b.displayOrder,
  }))

  const commonOpts = {
    clientId: client.id,
    date,
    serviceDuration: matched.duration || 30,
    shopHours: (client.chatbotHours as Record<string, string> | null) ?? null,
    shopBlockedDates: (client.blockedDates as string[]) ?? [],
    barbers,
    minLeadTimeMinutes: client.minLeadTimeMinutes,
    serviceBufferMinutes: client.serviceBufferMinutes,
    maxBookingHorizonDays: client.maxBookingHorizonDays,
    slotStepMinutes: client.slotStepMinutes,
  }

  // One-shot: for each barber, their own slots; plus the union.
  const [union, ...perBarber] = await Promise.all([
    getAvailableSlotsFromDB({ ...commonOpts, barberId: null }),
    ...barbers.map((b) =>
      getAvailableSlotsFromDB({ ...commonOpts, barberId: b.id }).then((slots) => ({
        id: b.id,
        slots,
      })),
    ),
  ])

  const byBarber: Record<string, Array<{ start: string; end: string }>> = {}
  for (const row of perBarber) byBarber[row.id] = row.slots

  return Response.json({ union, byBarber })
}
