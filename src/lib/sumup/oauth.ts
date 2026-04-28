// -----------------------------------------------------------------------------
// SumUp OAuth 2.0 — helpers para Authorization Code flow.
//
// Documentación: https://developer.sumup.com/tools/authorization/oauth
//
// Variables de entorno necesarias:
//   SUMUP_OAUTH_CLIENT_ID      — client_id de la OAuth App registrada
//   SUMUP_OAUTH_CLIENT_SECRET  — client_secret (server-only, jamás al frontend)
//   SUMUP_OAUTH_REDIRECT_URI   — debe coincidir EXACTO con el registrado en SumUp
//                                ej: https://otracita.es/api/sumup/oauth/callback
//
// Scopes aplicados (todos los necesarios para nuestro use case Cloud API):
//   transactions.history     — leer histórico (default, no review)
//   user.profile_readonly    — leer merchant_code via /me (default, no review)
//   readers.read             — listar Readers físicos del merchant
//   terminals.read           — info de terminal asociada al Reader
//   payments                 — crear checkouts en Cloud API (requiere review
//                              manual de SumUp; sin esto el botón "Cobrar"
//                              fallará con 403). Pídelo igual: SumUp lo
//                              aprueba en general en horas/días para apps
//                              POS legítimas.
//
// IMPORTANTE: si cambias scopes, los barberos YA conectados con el set
// anterior tendrán tokens con scopes obsoletos. El backend devolverá 403
// "Insufficient scopes" en endpoints que necesiten los nuevos. Solución:
// el barbero pulsa "Desconectar" y "Conectar SumUp" otra vez para emitir
// un token nuevo con los scopes actuales.
// -----------------------------------------------------------------------------

const SUMUP_BASE = 'https://api.sumup.com'

const SCOPES = [
  'transactions.history',
  'user.profile_readonly',
  'readers.read',
  'terminals.read',
  'payments',
].join(' ')

export function getOauthEnv(): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const clientId = process.env.SUMUP_OAUTH_CLIENT_ID
  const clientSecret = process.env.SUMUP_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.SUMUP_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'SumUp OAuth no configurado. Faltan vars: SUMUP_OAUTH_CLIENT_ID / SUMUP_OAUTH_CLIENT_SECRET / SUMUP_OAUTH_REDIRECT_URI',
    )
  }
  return { clientId, clientSecret, redirectUri }
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
    scope: SCOPES,
    state,
  })
  return `${SUMUP_BASE}/authorize?${params.toString()}`
}

export interface OauthTokenExchange {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
}

/**
 * Intercambia el `code` recibido en el callback por access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<OauthTokenExchange> {
  const { clientId, clientSecret, redirectUri } = getOauthEnv()
  const res = await fetch(`${SUMUP_BASE}/token`, {
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
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SumUp token exchange failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    scope: string
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
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
