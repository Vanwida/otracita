import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateCode, storeCode } from '@/lib/app-auth/otp'
import { sendWhatsAppMessage } from '@/lib/whatsapp/sender'
import { checkRateLimit, rateLimitResponse, WINDOW_HOUR_MS } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// POST /api/app/otp/request
// Body: { slug: "barberia-slug", phone: "+34..." }
//
// Generates a 6-digit code, stores it hashed, and sends it as a WhatsApp
// message from THE BARBER'S business number (reusing their Meta WhatsApp
// configuration). That way the customer sees the code arrive from the same
// number they'd normally chat with — more trust, less confusion.
//
// Rate limits: 3 codes per phone per hour + 20 per IP per hour — both on a
// one-hour window, matching what we tell the user. Caps spam and protects
// our WhatsApp credit.
// -----------------------------------------------------------------------------

/** Codes a single phone may request per hour. Mirrored in the login copy. */
const MAX_CODES_PER_PHONE_PER_HOUR = 3

/** Codes a single IP may request per hour (a household/office shares one). */
const MAX_CODES_PER_IP_PER_HOUR = 20

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'anon'
  )
}

function normalisePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('+')) return cleaned
  if (/^\d{9}$/.test(cleaned)) return `+34${cleaned}`
  if (/^\d{11,15}$/.test(cleaned)) return `+${cleaned}`
  return null
}

export async function POST(req: Request) {
  const ipLimit = checkRateLimit(
    `app-otp-req-ip:${clientIp(req)}`,
    MAX_CODES_PER_IP_PER_HOUR,
    WINDOW_HOUR_MS,
  )
  if (!ipLimit.ok) return rateLimitResponse(ipLimit)

  let body: { slug?: string; phone?: string }
  try {
    body = (await req.json()) as { slug?: string; phone?: string }
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const slug = (body.slug ?? '').trim()
  const phoneRaw = (body.phone ?? '').trim()
  if (!slug || !phoneRaw) {
    return Response.json({ error: 'slug y phone son obligatorios' }, { status: 400 })
  }
  const phone = normalisePhone(phoneRaw)
  if (!phone) return Response.json({ error: 'Teléfono inválido' }, { status: 400 })

  // 3 codes per phone per hour — prevents an attacker burning a whole number's
  // worth of OTPs (which would also lock the real user out).
  const phoneLimit = checkRateLimit(
    `app-otp-req-phone:${phone}`,
    MAX_CODES_PER_PHONE_PER_HOUR,
    WINDOW_HOUR_MS,
  )
  if (!phoneLimit.ok) return rateLimitResponse(phoneLimit)

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }
  const token = client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = client.whatsappPhoneNumberId
  if (!token || !phoneNumberId) {
    return Response.json(
      { error: 'Esta barbería aún no tiene WhatsApp activo — contáctala por otro canal.' },
      { status: 503 },
    )
  }

  const code = generateCode()
  await storeCode({ phone, clientId: client.id, code })

  const text = `Tu código de acceso a la app de ${client.businessName}: ${code}\nCaduca en 10 minutos. No lo compartas con nadie.`
  try {
    const result = (await sendWhatsAppMessage(phoneNumberId, phone, text, token)) as {
      error?: { message?: string }
    }
    if (result?.error) {
      console.error('[app/otp/request] WhatsApp error:', result.error)
      return Response.json(
        { error: 'No pudimos enviar el código. Revisa tu número o inténtalo en unos minutos.' },
        { status: 502 },
      )
    }
  } catch (err) {
    console.error('[app/otp/request] send threw:', err)
    return Response.json({ error: 'Error de red enviando el código.' }, { status: 502 })
  }

  return Response.json({ ok: true, hint: `Código enviado por WhatsApp a ${phone.slice(0, -4)}••••` })
}
