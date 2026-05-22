import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyPin } from '@/lib/team-auth/pin'
import { setTeamSession } from '@/lib/team-auth/session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// POST /api/team-access/login
//
// Body: { slug: string, pin: string }
//
// Verifica que el tenant existe, tiene `teamAccessEnabled = true` y tiene
// un PIN guardado, y que el PIN entregado matchea. Si todo OK setea la
// cookie firmada del modo equipo y devuelve { ok: true }.
//
// Rate-limit: 5/minuto por (IP + slug). Suficiente para parar a un bot
// haciendo brute-force en local; el espacio de búsqueda (4-6 dígitos) es
// pequeño así que esto es la primera defensa, no la única. Si en
// producción vemos abuso real, swapear a Upstash con ventana de 1h.
// -----------------------------------------------------------------------------

interface Body {
  slug?: unknown
  pin?: unknown
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''

  if (!slug || !pin) {
    return Response.json({ error: 'Faltan datos' }, { status: 400 })
  }

  // Rate-limit por IP + slug. La IP la sacamos de cabeceras de Vercel/proxy
  // (no confiamos en req.ip directo en Node runtime).
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const rl = checkRateLimit(`team-login:${slug}:${ip}`, 5)
  if (!rl.ok) return rateLimitResponse(rl)

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  // Respuestas idénticas para slug-no-existe vs PIN-malo vs acceso-desactivado:
  // no queremos enumeration de slugs ni filtración de qué barberías tienen
  // el acceso activo.
  const genericFail = Response.json({ error: 'PIN incorrecto' }, { status: 401 })

  if (!client) return genericFail
  if (!client.teamAccessEnabled || !client.teamPinHash) return genericFail
  if (!verifyPin(pin, client.teamPinHash)) return genericFail

  await setTeamSession(client.id)

  return Response.json({ ok: true, slug })
}
