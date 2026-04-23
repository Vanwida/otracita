import { db } from '@/db'
import { appUsers, clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyCode } from '@/lib/app-auth/otp'
import { issueAppSession } from '@/lib/app-auth/session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// POST /api/app/otp/verify
// Body: { slug: "barberia-slug", phone: "+34...", code: "123456", name?: "Alex" }
//
// Verifies the 6-digit code. On success, upserts the app_user (creates if
// new, updates `name` if it was missing), creates a signed session and
// returns it via httpOnly cookie. `clientId` is captured on first login so
// we know which barbería introduced this user to otracita — useful for
// attribution and loyalty seeding.
// -----------------------------------------------------------------------------

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
  const limit = checkRateLimit(`app-otp-verify:${clientIp(req)}`, 30)
  if (!limit.ok) return rateLimitResponse(limit)

  let body: { slug?: string; phone?: string; code?: string; name?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const phoneRaw = (body.phone ?? '').trim()
  const code = (body.code ?? '').trim()
  const slug = (body.slug ?? '').trim()
  if (!phoneRaw || !code || !slug) {
    return Response.json({ error: 'phone, code y slug son obligatorios' }, { status: 400 })
  }
  const phone = normalisePhone(phoneRaw)
  if (!phone) return Response.json({ error: 'Teléfono inválido' }, { status: 400 })
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ error: 'Código inválido' }, { status: 400 })
  }

  const result = await verifyCode(phone, code)
  if (!result.ok) {
    const messages: Record<string, string> = {
      invalid: 'Código incorrecto.',
      expired: 'El código ha caducado. Pide uno nuevo.',
      too_many_attempts: 'Demasiados intentos. Pide un código nuevo.',
      not_found: 'No hay código pendiente. Pide uno nuevo.',
    }
    return Response.json({ error: messages[result.reason] || 'No se pudo verificar' }, { status: 401 })
  }

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))

  // Upsert app_user by phone.
  const cleanName = body.name ? body.name.trim().slice(0, 80) : null
  const [existing] = await db.select().from(appUsers).where(eq(appUsers.phone, phone))
  let userId: string
  if (existing) {
    userId = existing.id
    if (cleanName && cleanName !== existing.name) {
      await db
        .update(appUsers)
        .set({ name: cleanName, updatedAt: new Date() })
        .where(eq(appUsers.id, existing.id))
    }
  } else {
    const [created] = await db
      .insert(appUsers)
      .values({ phone, name: cleanName })
      .returning()
    userId = created.id
  }

  await issueAppSession({
    userId,
    clientId: client?.id ?? null,
    userAgent: req.headers.get('user-agent'),
  })

  return Response.json({ ok: true, userId })
}
