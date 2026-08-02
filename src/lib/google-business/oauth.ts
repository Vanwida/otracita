// -----------------------------------------------------------------------------
// Google OAuth 2.0 — helpers para Authorization Code flow contra Google
// Business Profile (para auto-respuesta a reseñas de Google Maps).
//
// Documentación: https://developers.google.com/identity/protocols/oauth2/web-server
//
// Variables de entorno necesarias (ya presentes en .env.local):
//   GOOGLE_CLIENT_ID      — client_id del proyecto OAuth en Google Cloud Console
//   GOOGLE_CLIENT_SECRET  — client_secret (server-only, jamás al frontend)
//
// Redirect URI: derivado de SITE_ORIGIN, NO de una env var propia (a
// diferencia de SumUp) — debe estar registrado EXACTO en Google Cloud
// Console como URI de redirección autorizado:
//   https://otracita.es/api/google-business/oauth/callback
//
// Scope: business.manage — full read/write sobre el perfil (reviews,
// locations). Es el único scope disponible para Business Profile; no hay
// un scope más granular "solo reviews".
//
// access_type=offline + prompt="consent select_account" — dos prompts
// forzados a la vez, espacio-separados en el mismo parámetro (la spec de
// Google lo trata como "space-delimited, case-sensitive list of prompts";
// el único valor con restricción de exclusividad es "none", "consent" y
// "select_account" se combinan sin problema — verificado contra
// developers.google.com/identity/protocols/oauth2/web-server, no asumido).
//   · consent        → SIEMPRE garantiza refresh_token en la respuesta. Sin
//     esto, Google lo omite si el usuario ya autorizó la app antes (aunque
//     sea con otro scope) — inaceptable porque el cron necesita refrescar
//     el access_token sin intervención humana.
//   · select_account → fuerza el selector de cuentas de Google en vez de
//     reusar en silencio la sesión ya activa en el navegador. Sin esto: el
//     caso más probable de fallo en el primer uso real de esta feature es
//     que el barbero tenga su Gmail personal ya logueado (no la cuenta que
//     gestiona la ficha del negocio) — Google autoriza esa cuenta sin
//     preguntar, devolvemos 0 locations, y el barbero queda atascado sin
//     ninguna pista de que el problema es "cuenta equivocada" ni cómo
//     arreglarlo. select_account hace que Google SIEMPRE pregunte qué
//     cuenta usar, así que "reintentar como otra cuenta" es una opción real.
// -----------------------------------------------------------------------------

// Import relativo con extensión explícita (no alias `@/`) — este módulo se
// ejecuta directo con `node --experimental-strip-types` en los tests
// (oauth.test.ts), que no resuelve el alias de tsconfig.
import { SITE_ORIGIN } from '../site.ts'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

const SCOPE = 'https://www.googleapis.com/auth/business.manage'

/**
 * Forma mínima de "fetch" que necesitamos — nos permite inyectar un stub en
 * tests sin depender de la shape completa de `Response` del DOM lib.
 */
export interface FetchLikeResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}
export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchLikeResponse>

export function getOauthEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth no configurado. Faltan vars: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
    )
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${SITE_ORIGIN}/api/google-business/oauth/callback`,
  }
}

/**
 * URL de autorización a la que redirigir al barbero. Genera state CSRF
 * que el caller debe persistir en cookie/session para validar al volver.
 */
export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getOauthEnv()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    access_type: 'offline',
    prompt: 'consent select_account',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Error tipado del endpoint /token de Google. `code` mapea el campo
 * `error` que Google devuelve en el body JSON (p.ej. 'invalid_grant',
 * 'invalid_client') — es lo que usa client.ts para distinguir "refresh
 * token revocado" (invalid_grant) de cualquier otro fallo transitorio.
 */
export class GoogleOauthError extends Error {
  status: number
  code?: string
  body?: unknown

  // Nota: sin "parameter properties" de TS (constructor(public x: T)) — Node
  // en modo `--experimental-strip-types` (strip-only, sin codegen) no las
  // soporta y revienta en runtime. Asignación explícita en el body.
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message)
    this.name = 'GoogleOauthError'
    this.status = status
    this.code = code
    this.body = body
  }
}

export interface GoogleOauthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
}

export interface GoogleOauthRefresh {
  accessToken: string
  expiresAt: Date
  scope: string
}

async function throwTokenError(res: FetchLikeResponse): Promise<never> {
  const body = await res.text().catch(() => '')
  let code: string | undefined
  try {
    const parsed = JSON.parse(body) as { error?: string }
    code = parsed.error
  } catch {
    code = undefined
  }
  throw new GoogleOauthError(
    res.status,
    `Google token endpoint devolvió ${res.status}: ${body.slice(0, 300)}`,
    code,
    body,
  )
}

/**
 * Intercambia el `code` recibido en el callback por access + refresh tokens.
 * Google garantiza refresh_token aquí porque siempre pedimos prompt=consent.
 */
export async function exchangeCodeForTokens(
  code: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleOauthTokens> {
  const { clientId, clientSecret, redirectUri } = getOauthEnv()
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) await throwTokenError(res)

  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
  }
  if (!data.refresh_token) {
    // No debería pasar nunca con prompt=consent — si pasa, es un fallo de
    // configuración (scope distinto entre intentos, o Google cambiando
    // comportamiento) y preferimos abortar la conexión a guardar un cliente
    // sin refresh_token que dejaría de funcionar en cuanto expire el access.
    throw new GoogleOauthError(0, 'Google no devolvió refresh_token pese a prompt=consent')
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  }
}

/**
 * Renueva el access_token con el refresh_token guardado. Google normalmente
 * NO rota el refresh_token en este grant (a diferencia de SumUp) — se sigue
 * usando el mismo hasta que el barbero revoque el acceso.
 *
 * Si el refresh_token fue revocado (el barbero quitó el acceso desde su
 * cuenta de Google, o lo revocó implícitamente al reconectar con otra
 * cuenta), Google responde 400 con `{"error":"invalid_grant",...}` — el
 * `code` queda en el GoogleOauthError para que el caller (client.ts) lo
 * distinga de un fallo transitorio.
 */
export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleOauthRefresh> {
  const { clientId, clientSecret } = getOauthEnv()
  const res = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) await throwTokenError(res)

  const data = (await res.json()) as { access_token: string; expires_in: number; scope: string }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  }
}

/**
 * Genera un state CSRF aleatorio (32 bytes hex). Lo guardamos en cookie
 * httpOnly para validar en el callback.
 */
export function generateState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
