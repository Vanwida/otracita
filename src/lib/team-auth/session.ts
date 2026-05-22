import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { MS_IN_DAY } from '@/lib/time'

// -----------------------------------------------------------------------------
// Modo equipo — sesión por COOKIE FIRMADA HMAC (stateless, sin tabla en DB).
//
// Por qué stateless:
//   · No queremos trazabilidad individual (modelo "un PIN compartido para
//     todo el equipo"). Crear una sesión-row por dispositivo metería
//     fingerprinting de facto.
//   · El secreto de firma es global (BETTER_AUTH_SECRET). Revocar el PIN
//     en DB invalida el ACCESO siguiente (login pide PIN), no las cookies
//     ya emitidas — por eso la cookie tiene TTL corto (7 días) y el
//     login regenera. Para "echar a alguien YA", el dueño regenera PIN +
//     resetea el secreto (op admin futura) o limpia cookies en el navegador
//     compartido.
//
// Formato del valor de la cookie (todo URL-safe):
//
//     v1.<clientId>.<expEpochSec>.<base64urlHmac>
//
// La firma cubre `<clientId>.<expEpochSec>` con HMAC-SHA256 sobre el
// secreto del proyecto. La verificación es timing-safe.
// -----------------------------------------------------------------------------

const COOKIE_NAME = 'otracita-team-session'
const SESSION_DAYS = 7
const VERSION = 'v1'

function getSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET
  if (!s || s.length < 16) {
    // Fail-closed: si no hay secreto, no podemos firmar/verificar nada.
    // Mejor lanzar visible que aceptar cookies sin firma válida.
    throw new Error('BETTER_AUTH_SECRET missing — team session cannot sign cookies')
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

export interface TeamSession {
  clientId: string
  expiresAt: Date
}

/**
 * Setea la cookie firmada del modo equipo. Llamado tras verificar el PIN
 * en /equipo/[slug]/login. TTL 7 días.
 */
export async function setTeamSession(clientId: string): Promise<void> {
  const expEpochSec = Math.floor((Date.now() + SESSION_DAYS * MS_IN_DAY) / 1000)
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
 * Lee y verifica la cookie firmada. Devuelve null si:
 *   · no hay cookie
 *   · firma inválida
 *   · expirada
 *   · estructura corrupta
 *
 * NO toca DB — el caller decide si validar también que el tenant siga
 * con `teamAccessEnabled=true` (típico: layout y route handlers).
 */
export async function getTeamSession(): Promise<TeamSession | null> {
  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return null

  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [version, clientId, expStr, sig] = parts as [string, string, string, string]
  if (version !== VERSION) return null
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) return null

  const expEpochSec = Number.parseInt(expStr, 10)
  if (!Number.isFinite(expEpochSec)) return null
  if (expEpochSec * 1000 <= Date.now()) return null

  const expected = sign(`${clientId}.${expStr}`)
  if (!safeEqual(sig, expected)) return null

  return { clientId, expiresAt: new Date(expEpochSec * 1000) }
}

/** Elimina la cookie del modo equipo (logout). */
export async function clearTeamSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

/**
 * Helper para leer la cookie firmada desde un Request (en route handlers
 * donde `cookies()` de next/headers no aplica al request entrante).
 * Mismo formato y misma verificación que `getTeamSession`.
 */
export function readTeamSessionFromRequest(req: Request): TeamSession | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  // Parser mínimo (no instalamos cookie lib por una sola lectura).
  const target = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
  if (!target) return null
  const raw = decodeURIComponent(target.slice(COOKIE_NAME.length + 1))
  if (!raw) return null

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
