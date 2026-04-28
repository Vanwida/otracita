import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { db } from '@/db'
import { mobileSessions, clients } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

// -----------------------------------------------------------------------------
// Auth para la app móvil "otracita Cobros".
//
// Token format: hex 64 chars (32 bytes random). Se devuelve UNA VEZ a la app
// tras canjear PIN, y se guarda en Keychain del iPhone. Backend solo guarda
// SHA-256 hex del token; comparación con timingSafeEqual.
//
// Header en cada request: Authorization: Bearer <token>
// -----------------------------------------------------------------------------

const TOKEN_BYTES = 32

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Hashea PIN o token con SHA-256 hex. Usado para guardado en DB.
 * Mismo algoritmo que `hashToken` — alias semántico.
 */
export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex')
}

/**
 * Compara dos hashes hex en tiempo constante (anti-timing-attack).
 * Necesario porque PIN/token validation es ruta crítica de auth.
 */
export function safeHashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

export type ClientRow = typeof clients.$inferSelect

export type MobileAuth =
  | { ok: true; client: ClientRow; sessionId: string }
  | { ok: false; status: 401 | 403; error: string }

/**
 * Valida el header Authorization de una request mobile y devuelve el client
 * dueño del session token. Actualiza last_used_at para detectar inactividad.
 *
 * Falla con 401 si:
 *   · No hay header
 *   · Token no encontrado
 *   · Sesión revocada (revoked_at != null)
 */
export async function requireMobileAuth(req: Request): Promise<MobileAuth> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token' }
  }
  const token = header.slice(7).trim()
  if (!token || token.length !== TOKEN_BYTES * 2) {
    return { ok: false, status: 401, error: 'Invalid token format' }
  }

  const tokenHash = hashToken(token)
  const [session] = await db
    .select()
    .from(mobileSessions)
    .where(and(eq(mobileSessions.tokenHash, tokenHash), isNull(mobileSessions.revokedAt)))

  if (!session) return { ok: false, status: 401, error: 'Token revoked or not found' }

  const [client] = await db.select().from(clients).where(eq(clients.id, session.clientId))
  if (!client) return { ok: false, status: 403, error: 'Client not found' }

  // Best-effort touch — no bloquear la request si falla.
  void db
    .update(mobileSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(mobileSessions.id, session.id))
    .catch(() => null)

  return { ok: true, client, sessionId: session.id }
}

export function mobileAuthErrorResponse(auth: MobileAuth & { ok: false }): Response {
  return Response.json({ error: auth.error }, { status: auth.status })
}
