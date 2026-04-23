import { db } from '@/db'
import { barbers as barbersTable, clients } from '@/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { getAvailableSlotsFromDB } from '@/lib/availability'
import type { BarberConfig } from '@/lib/whatsapp/config'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// GET /api/public/availability?slug=...&service=...&date=YYYY-MM-DD&barberId=?
//
// Public endpoint (no auth) used by the /b/[slug] booking page. Resolves the
// barbería by slug, loads active barbers + shop defaults, and returns the
// available slots using the SAME availability engine as the bot. All
// scheduling standards (lead time, horizon, buffer, per-barber hours) apply.
// Rate-limited by IP to prevent scraping.
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
  // Aggressive per-IP rate limit: someone scraping availability across all
  // barberías could DoS us otherwise. 60/min per IP is plenty for a real user.
  const limit = checkRateLimit(`public-availability:${clientIp(req)}`, 60)
  if (!limit.ok) return rateLimitResponse(limit)

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')
  const service = url.searchParams.get('service')
  const date = url.searchParams.get('date')
  const barberId = url.searchParams.get('barberId')

  if (!slug || !service || !date) {
    return Response.json({ error: 'slug, service y date son obligatorios' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'date inválido' }, { status: 400 })
  }

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }

  const services = (client.chatbotServices as Service[] | null) || []
  const matched = services.find((s) => s?.name?.toLowerCase() === service.toLowerCase())
  if (!matched) {
    return Response.json({ error: 'Servicio no encontrado' }, { status: 404 })
  }

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

  // Validate the optional barberId belongs to this client before using it —
  // prevents cross-tenant leakage via forged params.
  let resolvedBarberId: string | null = null
  if (barberId) {
    const match = barbers.find((b) => b.id === barberId)
    if (!match) {
      return Response.json({ error: 'Barbero no válido' }, { status: 400 })
    }
    resolvedBarberId = match.id
  }

  const slots = await getAvailableSlotsFromDB({
    clientId: client.id,
    date,
    serviceDuration: matched.duration || 30,
    shopHours: (client.chatbotHours as Record<string, string> | null) ?? null,
    shopBlockedDates: (client.blockedDates as string[]) ?? [],
    barbers,
    barberId: resolvedBarberId,
    minLeadTimeMinutes: client.minLeadTimeMinutes,
    serviceBufferMinutes: client.serviceBufferMinutes,
    maxBookingHorizonDays: client.maxBookingHorizonDays,
  })

  return Response.json({ slots })
}
