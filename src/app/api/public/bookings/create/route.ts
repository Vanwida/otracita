import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { createBooking } from '@/lib/bookings/create'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// POST /api/public/bookings/create
//
// Public endpoint (no auth) used by the /b/[slug] page. Resolves the
// barbería by slug and funnels through the same `createBooking` helper used
// by the dashboard + bot, so scheduling standards / auto-invoicing / barber
// resolution all apply identically.
//
// Rate-limited by IP + phone to prevent abuse (someone spamming a barber
// with 100 fake reservations). Also normalises the phone to a canonical
// shape so returning customers re-use their existing history.
// -----------------------------------------------------------------------------

interface Body {
  slug?: unknown
  service?: unknown
  date?: unknown
  time?: unknown
  barberId?: unknown
  customerName?: unknown
  customerPhone?: unknown
  customerEmail?: unknown
  notes?: unknown
  /** Atribución capturada en el cliente (utm/referrer). */
  attribution?: unknown
}

// Source/medium normalizados — debe coincidir con `AttributionSource`/
// `AttributionMedium` en `src/lib/attribution/types.ts`. Lo replicamos
// como string-literal local para que el server NO importe el módulo
// 'use client' del helper de localStorage.
const VALID_SOURCES = new Set([
  'instagram', 'google_ads', 'google_organic', 'facebook', 'tiktok',
  'youtube', 'whatsapp_bot', 'walk_in', 'referral', 'direct', 'other',
])
const VALID_MEDIUMS = new Set([
  'cpc', 'organic', 'social', 'referral', 'email', 'none',
])

function sanitizeAttribution(raw: unknown): {
  source: string
  medium: string
  campaign: string | null
} | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const source = typeof obj.source === 'string' ? obj.source.trim().toLowerCase() : null
  const medium = typeof obj.medium === 'string' ? obj.medium.trim().toLowerCase() : null
  if (!source || !VALID_SOURCES.has(source)) return null
  if (!medium || !VALID_MEDIUMS.has(medium)) return null
  const rawCampaign = typeof obj.campaign === 'string' ? obj.campaign.trim().toLowerCase().slice(0, 80) : ''
  return { source, medium, campaign: rawCampaign || null }
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon'
  )
}

/**
 * Normalise a user-typed phone to E.164-ish digits. We're lenient: accept
 * anything and store digits. Spanish default country code added only when
 * the number is 9-digit (ES mobile) with no leading country code.
 */
function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  // Bare 9-digit → assume ES
  if (/^\d{9}$/.test(cleaned)) return `+34${cleaned}`
  // Already has country without +
  if (/^\d{11,15}$/.test(cleaned)) return `+${cleaned}`
  return cleaned
}

export async function POST(req: Request) {
  // Per-IP limit — stops generic spam scripts.
  const ipLimit = checkRateLimit(`public-book-ip:${clientIp(req)}`, 10)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const service = typeof body.service === 'string' ? body.service.trim() : ''
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const time = typeof body.time === 'string' ? body.time.trim() : ''
  const barberId = typeof body.barberId === 'string' && body.barberId ? body.barberId : null
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  const rawPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : ''
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : ''

  if (!slug) return Response.json({ error: 'slug requerido' }, { status: 400 })
  if (!service) return Response.json({ error: 'Servicio requerido' }, { status: 400 })
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: 'Fecha inválida' }, { status: 400 })
  if (!time || !/^\d{2}:\d{2}$/.test(time))
    return Response.json({ error: 'Hora inválida' }, { status: 400 })
  if (!customerName || customerName.length > 80)
    return Response.json({ error: 'Nombre inválido (1-80 caracteres)' }, { status: 400 })
  if (!rawPhone)
    return Response.json({ error: 'Teléfono requerido' }, { status: 400 })

  const phone = normalisePhone(rawPhone)
  if (!/^\+?\d{9,15}$/.test(phone))
    return Response.json({ error: 'Teléfono inválido' }, { status: 400 })

  // Per-phone limit — one phone can't spam 10 bookings in a minute.
  const phoneLimit = checkRateLimit(`public-book-phone:${phone}`, 3)
  if (!phoneLimit.ok) return rateLimitResponse(phoneLimit)

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }

  const attribution = sanitizeAttribution(body.attribution)

  const result = await createBooking({
    client,
    customerName,
    customerPhone: phone,
    service,
    barberId,
    date,
    time,
    source: 'web',
    attribution,
  })

  if (!result.success) {
    const status =
      result.error === 'overlap'
        ? 409
        : result.error === 'lead_time' || result.error === 'horizon' || result.error === 'no_barber_available'
          ? 422
          : 400
    return Response.json({ error: result.message }, { status })
  }

  // Silently log email + notes to the server for now — no column to store
  // them yet (both are truly optional). TODO: if real demand, add
  // bookings.customer_email + bookings.notes in a future migration.
  if (customerEmail || notes) {
    console.log(
      `[public-booking] optional fields: email=${customerEmail || 'none'} notes=${notes ? notes.length + 'chars' : 'none'} booking=${result.booking.id}`,
    )
  }

  return Response.json({
    success: true,
    bookingId: result.booking.id,
    barber: result.booking.barber,
  })
}
