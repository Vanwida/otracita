import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

// -----------------------------------------------------------------------------
// Barber-auth — sesión móvil personal del barbero (#71).
//
// Modelo (mismo patrón que admin-lock):
//   · El barbero abre un link `/r/<personalAccessToken>` en su móvil.
//   · El handler resuelve el token → barberId, setea esta cookie firmada
//     HMAC(BETTER_AUTH_SECRET) con TTL 1 año, y redirige a `/r/<token>/agenda`.
//   · Mientras la cookie esté viva, las rutas `/r/<token>/*` resuelven la
//     sesión sin volver a tocar el token en URL. Si el jefe revoca/regenera
//     el token, la cookie sigue siendo válida hasta caducidad — pero los
//     endpoints scope-limited validan ADEMÁS que el barbero siga activo y,
//     en el caso de regeneración, que el barber_session_version siga
//     coincidiendo (lo dejamos para el siguiente iter: hoy basta con que
//     una regeneración invalide el TOKEN del link, no la cookie ya emitida;
//     un barbero que pierde el móvil debe ser desactivado).
//
// Formato del valor (todo URL-safe):
//
//     v1.<barberId>.<expEpochSec>.<base64urlHmac>
//
// La firma cubre `<barberId>.<expEpochSec>` con HMAC-SHA256 sobre
// BETTER_AUTH_SECRET. Verificación timing-safe.
// -----------------------------------------------------------------------------

const COOKIE_NAME = 'otracita-barber-session'
const SESSION_TTL_DAYS = 365
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
const VERSION = 'v1'

function getSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s || s.length < 16) {
    throw new Error('BETTER_AUTH_SECRET missing — barber-auth cannot sign cookies')
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

export interface BarberSession {
  barberId: string
  expiresAt: Date
}

/**
 * Setea la cookie firmada de la sesión del barbero (TTL 1 año). Llamado
 * desde el resolver `/r/[token]` tras validar que el token mapea a un
 * barbero activo del tenant.
 */
export async function setBarberSession(barberId: string): Promise<void> {
  const expEpochSec = Math.floor((Date.now() + SESSION_TTL_MS) / 1000)
  const payload = `${barberId}.${expEpochSec}`
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
export async function getBarberSession(): Promise<BarberSession | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return null
  return parseAndVerify(raw)
}

/** Elimina la cookie de la sesión del barbero. */
export async function clearBarberSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

/**
 * Lee y verifica la cookie desde un Request (en route handlers donde
 * `cookies()` no aplica al request entrante).
 */
export function readBarberSessionFromRequest(req: Request): BarberSession | null {
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

function parseAndVerify(raw: string): BarberSession | null {
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [version, barberId, expStr, sig] = parts as [string, string, string, string]
  if (version !== VERSION) return null
  if (!barberId || !/^[0-9a-f-]{36}$/i.test(barberId)) return null

  const expEpochSec = Number.parseInt(expStr, 10)
  if (!Number.isFinite(expEpochSec)) return null
  if (expEpochSec * 1000 <= Date.now()) return null

  try {
    const expected = sign(`${barberId}.${expStr}`)
    if (!safeEqual(sig, expected)) return null
  } catch {
    return null
  }

  return { barberId, expiresAt: new Date(expEpochSec * 1000) }
}
