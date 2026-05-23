import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { MS_IN_MINUTE } from '@/lib/time'

// -----------------------------------------------------------------------------
// Admin-lock — sesión por COOKIE FIRMADA HMAC (stateless, sin tabla en DB).
//
// Modelo: el iPad ya está logueado como ADMIN (jefe). Las áreas marcadas
// como sensibles aparecen bloqueadas (overlay con PIN del jefe). Al meter
// el PIN correcto se setea una cookie "admin-lock" con TTL de 30 minutos.
// Mientras la cookie esté viva, esas áreas se ven sin pedir el PIN otra
// vez. Tras 30 min de inactividad o tap en "Cerrar gestión" → expira y
// vuelve a bloquearse.
//
// Por qué stateless:
//   · No queremos trazabilidad — la sesión admin de Better Auth ya
//     identifica al jefe (es su login). Esta cookie solo dice "el PIN se
//     metió hace < 30 min", nada más.
//   · El secreto de firma es global (BETTER_AUTH_SECRET). El clientId va
//     en el payload para que una cookie no sirva en otro tenant.
//
// Formato del valor (todo URL-safe):
//
//     v1.<clientId>.<expEpochSec>.<base64urlHmac>
//
// La firma cubre `<clientId>.<expEpochSec>` con HMAC-SHA256 sobre el
// secreto del proyecto. Verificación timing-safe.
// -----------------------------------------------------------------------------

const COOKIE_NAME = 'otracita-admin-lock-session'
const SESSION_TTL_MS = 30 * MS_IN_MINUTE
const VERSION = 'v1'

function getSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s || s.length < 16) {
    // Fail-closed: sin secreto no podemos firmar/verificar nada.
    throw new Error('BETTER_AUTH_SECRET missing — admin-lock cannot sign cookies')
  }
  return s
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function sign(payload: string): string {
  return base64UrlEncode(createHmac('sha256', getSecret()).update(payload).digest())
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export interface AdminLockSession {
  clientId: string
  expiresAt: Date
}

/**
 * Setea la cookie firmada del admin-lock (TTL 30 min, sliding window —
 * cada vez que se desbloquea un área se renueva). Llamado tras verificar
 * el PIN en /api/admin-lock/unlock.
 */
export async function setAdminLockSession(clientId: string): Promise<void> {
  const expEpochSec = Math.floor((Date.now() + SESSION_TTL_MS) / 1000)
  const payload = `${clientId}.${expEpochSec}`
  const sig = sign(payload)
  const value = `${VERSION}.${payload}.${sig}`

  const jar = await cookies()
  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expEpochSec * 1000),
  })
}

/**
 * Lee y verifica la cookie firmada. Devuelve null si no hay cookie,
 * firma inválida, expirada o estructura corrupta. NO toca DB.
 */
export async function getAdminLockSession(): Promise<AdminLockSession | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return null
  return parseAndVerify(raw)
}

/** Elimina la cookie del admin-lock (lock manual o auto-lock). */
export async function clearAdminLockSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

/**
 * Lee y verifica la cookie desde un Request (en route handlers donde
 * `cookies()` no aplica al request entrante).
 */
export function readAdminLockSessionFromRequest(req: Request): AdminLockSession | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  const target = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!target) return null
  const raw = decodeURIComponent(target.slice(COOKIE_NAME.length + 1))
  if (!raw) return null
  return parseAndVerify(raw)
}

function parseAndVerify(raw: string): AdminLockSession | null {
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [version, clientId, expStr, sig] = parts as [string, string, string, string]
  if (version !== VERSION) return null
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) return null

  const expEpochSec = Number.parseInt(expStr, 10)
  if (!Number.isFinite(expEpochSec)) return null
  if (expEpochSec * 1000 <= Date.now()) return null

  try {
    const expected = sign(`${clientId}.${expStr}`)
    if (!safeEqual(sig, expected)) return null
  } catch {
    return null
  }

  return { clientId, expiresAt: new Date(expEpochSec * 1000) }
}
