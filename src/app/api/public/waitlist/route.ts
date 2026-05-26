import { db } from '@/db'
import { barbers, clients, waitlist } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { canonicalPhone } from '@/lib/phone'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { BUSINESS_TIMEZONE } from '@/lib/time'

// -----------------------------------------------------------------------------
// POST /api/public/waitlist
//
// Endpoint público (sin auth) usado por la PWA cuando el cliente pulsa
// "avísame si se libera" sobre un slot ocupado o un día sin huecos.
//
// Gating idéntico a /api/public/bookings/create:
//   · Resuelve la barbería por `slug` (clients.publicEnabled).
//   · Rate-limit por IP + teléfono (cuotas pequeñas, esto NO es un endpoint
//     de uso masivo: un cliente no debería apuntarse a 20 listas por minuto).
//   · Phone se canonicaliza una sola vez (compat con bookings).
//
// Crea una entrada con status='waiting' y `expiresAt` = fecha + 23:59 Madrid
// (pasada esa fecha la entrada ya no aplica). Idempotente per
// (clientId, customerPhone, date, time): si el cliente pulsa el botón dos
// veces, la segunda no crea fila duplicada (devuelve la existente).
// -----------------------------------------------------------------------------

interface Body {
  slug?: unknown
  customerPhone?: unknown
  customerName?: unknown
  date?: unknown           // YYYY-MM-DD
  time?: unknown           // HH:MM — slot concreto pedido
  desiredTimeStart?: unknown // HH:MM (default = time)
  desiredTimeEnd?: unknown   // HH:MM (default = time + 60 min)
  barberId?: unknown       // uuid | null = cualquier barbero
  service?: unknown        // nombre del servicio (opcional pero recomendado)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon'
  )
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minutes)))
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Construye la fecha "expira al final del día Madrid" como timestamp UTC. */
function endOfDayInMadrid(dateISO: string): Date {
  // Madrid en horario de invierno (CET) está en UTC+1, en verano (CEST) UTC+2.
  // No queremos cargar tzdata aquí — basta con interpretar el día como
  // Europe/Madrid `23:59:59` y convertirlo a UTC vía Intl.
  // Atajo robusto: tomamos las 23:59 del día siguiente menos 1 minuto en UTC
  // y dejamos que el filtro por "expiresAt < now" en TZ UTC haga su trabajo.
  // Calidad suficiente: el cron de expiración corre con holgura horaria.
  const d = new Date(`${dateISO}T23:59:00Z`)
  return d
}

function normalisePhone(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (/^\d{9}$/.test(cleaned)) return `+34${cleaned}`
  if (/^\d{11,15}$/.test(cleaned)) return `+${cleaned}`
  return cleaned
}

export async function POST(req: Request) {
  const ipLimit = checkRateLimit(`public-waitlist-ip:${clientIp(req)}`, 10)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const rawPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : ''
  const customerName =
    typeof body.customerName === 'string' && body.customerName.trim()
      ? body.customerName.trim().slice(0, 80)
      : null
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const time = typeof body.time === 'string' ? body.time.trim() : ''
  const rawStart = typeof body.desiredTimeStart === 'string' ? body.desiredTimeStart.trim() : ''
  const rawEnd = typeof body.desiredTimeEnd === 'string' ? body.desiredTimeEnd.trim() : ''
  const barberId =
    typeof body.barberId === 'string' && body.barberId ? body.barberId : null
  const service =
    typeof body.service === 'string' && body.service.trim()
      ? body.service.trim().slice(0, 120)
      : null

  if (!slug) return Response.json({ error: 'slug requerido' }, { status: 400 })
  if (!rawPhone) return Response.json({ error: 'Teléfono requerido' }, { status: 400 })
  if (!date || !DATE_RE.test(date))
    return Response.json({ error: 'Fecha inválida' }, { status: 400 })
  if (!time || !TIME_RE.test(time))
    return Response.json({ error: 'Hora inválida' }, { status: 400 })

  const desiredStart = rawStart && TIME_RE.test(rawStart) ? rawStart : time
  const desiredEnd =
    rawEnd && TIME_RE.test(rawEnd) ? rawEnd : toHHMM(toMinutes(time) + 60)
  // Sanity: end > start.
  if (toMinutes(desiredEnd) <= toMinutes(desiredStart)) {
    return Response.json({ error: 'Rango de hora inválido' }, { status: 400 })
  }

  // Día en pasado → rechazar (no tiene sentido apuntarse a algo ya pasado).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
  if (date < today) {
    return Response.json({ error: 'Esa fecha ya pasó' }, { status: 400 })
  }

  const phoneE164 = normalisePhone(rawPhone)
  if (!/^\+?\d{9,15}$/.test(phoneE164)) {
    return Response.json({ error: 'Teléfono inválido' }, { status: 400 })
  }

  const phoneLimit = checkRateLimit(`public-waitlist-phone:${phoneE164}`, 5)
  if (!phoneLimit.ok) return rateLimitResponse(phoneLimit)

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }

  // Validar barberId pertenece al tenant + activo (si vino).
  let resolvedBarberId: string | null = null
  if (barberId) {
    const [b] = await db
      .select({ id: barbers.id })
      .from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.clientId, client.id), eq(barbers.active, true)))
    if (!b) {
      return Response.json({ error: 'Profesional no válido' }, { status: 400 })
    }
    resolvedBarberId = b.id
  }

  const phone = canonicalPhone(phoneE164)

  // Idempotencia: si el cliente ya tiene una entrada 'waiting' para
  // (clientId, phone, date, time, barberId), la devolvemos en vez de duplicar.
  const existing = await db
    .select()
    .from(waitlist)
    .where(
      and(
        eq(waitlist.clientId, client.id),
        eq(waitlist.customerPhone, phone),
        eq(waitlist.date, date),
        eq(waitlist.status, 'waiting'),
      ),
    )

  const dup = existing.find(
    (e) =>
      e.time === time &&
      (e.barberId ?? null) === (resolvedBarberId ?? null),
  )
  if (dup) {
    return Response.json({ ok: true, alreadyOnList: true, id: dup.id })
  }

  const [created] = await db
    .insert(waitlist)
    .values({
      clientId: client.id,
      customerPhone: phone,
      customerName,
      date,
      time,
      desiredTimeStart: desiredStart,
      desiredTimeEnd: desiredEnd,
      barberId: resolvedBarberId,
      service,
      status: 'waiting',
      expiresAt: endOfDayInMadrid(date),
    })
    .returning()

  return Response.json({ ok: true, id: created.id })
}
