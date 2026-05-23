import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { verifyPin } from '@/lib/admin-lock/pin'
import { setAdminLockSession } from '@/lib/admin-lock/session'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

// -----------------------------------------------------------------------------
// POST /api/admin-lock/unlock
//
// Body: { pin: string }
//
// Verifica el PIN del jefe contra el hash guardado en
// `clients.adminPinHash` y, si OK, setea la cookie firmada del admin-lock
// (TTL 30 min). El tenant se resuelve por la SESIÓN ADMIN — NUNCA se
// acepta clientId del body. Esto es importante: en otracita un iPad solo
// está logueado como UN admin a la vez, así que la cookie admin-lock va
// pegada a ese tenant.
//
// Rate-limit: 8/minuto por IP. El espacio de 4-6 dígitos es pequeño, así
// que esto es la primera defensa. La sesión admin de Better Auth ya filtra
// requests anónimos.
// -----------------------------------------------------------------------------

interface Body {
  pin?: unknown
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers })
  const email = session?.user?.email ?? null
  if (!email) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const pin = typeof body.pin === 'string' ? body.pin.trim() : ''
  if (!pin) {
    return Response.json({ error: 'Falta el PIN' }, { status: 400 })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const rl = checkRateLimit(`admin-lock-unlock:${email}:${ip}`, 8)
  if (!rl.ok) return rateLimitResponse(rl)

  const [client] = await db.select().from(clients).where(eq(clients.email, email))
  if (!client) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }
  if (!client.lockEnabled || !client.adminPinHash) {
    return Response.json({ error: 'El lock no está activo' }, { status: 409 })
  }
  if (!verifyPin(pin, client.adminPinHash)) {
    return Response.json({ error: 'PIN incorrecto' }, { status: 401 })
  }

  await setAdminLockSession(client.id)
  return Response.json({ ok: true })
}
