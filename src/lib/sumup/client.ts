// -----------------------------------------------------------------------------
// SumUp REST API client — wrapper finito de los endpoints que usamos.
//
// Endpoints cubiertos:
//   · GET  /v0.1/me                                     → merchant_code
//   · GET  /v0.1/merchants/{code}/readers               → listar Readers
//   · POST /v0.1/merchants/{code}/readers/{rid}/checkout → iniciar cobro
//                                                          (resultado via return_url)
//   · POST /token  (refresh_token grant)                → renovar access_token
//
// Auth: Bearer access_token (de OAuth flow del barbero).
// -----------------------------------------------------------------------------

const SUMUP_BASE = 'https://api.sumup.com'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SumupReader {
  id: string
  name: string
  status: 'unknown' | 'paired' | 'expired' | 'unpaired' | string
  device: { identifier?: string; model?: string }
  meta?: Record<string, unknown>
}

export interface SumupReadersListResponse {
  items: SumupReader[]
}

export interface SumupCheckoutResponse {
  data: {
    /** ID interno del checkout que SumUp acaba de crear. Lo usamos para
     *  correlacionar el callback (return_url) con el cobro original. */
    client_transaction_id: string
  }
}

export interface SumupMeResponse {
  merchant_profile: {
    merchant_code: string
    country: string
    default_currency: string
  }
  personal_profile?: {
    first_name?: string
    last_name?: string
    email?: string
  }
}

export interface SumupOauthTokens {
  access_token: string
  refresh_token: string
  expires_in: number          // seconds
  token_type: 'Bearer'
  scope: string
}

export class SumupApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'SumupApiError'
  }
}

// -----------------------------------------------------------------------------
// Internal helper
// -----------------------------------------------------------------------------

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUMUP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new SumupApiError(res.status, `SumUp ${res.status} on ${path}: ${body.slice(0, 300)}`, body)
  }
  return (await res.json()) as T
}

// -----------------------------------------------------------------------------
// Endpoints
// -----------------------------------------------------------------------------

/** GET /v0.1/me — devuelve merchant_code del access_token. */
export function getMe(token: string): Promise<SumupMeResponse> {
  return request<SumupMeResponse>('/v0.1/me', token)
}

/** GET /v0.1/merchants/{code}/readers — listado de Readers físicos del merchant. */
export function listReaders(token: string, merchantCode: string): Promise<SumupReadersListResponse> {
  return request<SumupReadersListResponse>(`/v0.1/merchants/${merchantCode}/readers`, token)
}

interface CreateReaderCheckoutInput {
  /** Importe en céntimos. Lo convertimos a "minor unit" en el body. */
  amountCents: number
  currency: string                    // 'EUR'
  /** URL pública absoluta a la que SumUp llamará con el resultado. */
  returnUrl: string
  /** Identificador externo nuestro para correlacionar (ej: bookingId). */
  description?: string
  /** Affiliate key (header obligatorio para Cloud API). */
  affiliateKey: string
}

/**
 * POST /v0.1/merchants/{code}/readers/{rid}/checkout
 *
 * Inicia un cobro en el Reader físico del merchant. SumUp devuelve un
 * `client_transaction_id` síncronamente; el resultado del pago llega después
 * via webhook al `return_url`. El Reader pita y muestra "acerca tarjeta".
 */
export async function createReaderCheckout(
  token: string,
  merchantCode: string,
  readerId: string,
  input: CreateReaderCheckoutInput,
): Promise<SumupCheckoutResponse> {
  const body = {
    total_amount: {
      value: input.amountCents,                            // SumUp espera minor unit
      currency: input.currency,
      minor_unit: 2,
    },
    return_url: input.returnUrl,
    description: input.description,
  }
  const res = await fetch(
    `${SUMUP_BASE}/v0.1/merchants/${merchantCode}/readers/${readerId}/checkout`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Affiliate-Key': input.affiliateKey,
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new SumupApiError(res.status, `SumUp checkout ${res.status}: ${text.slice(0, 300)}`, text)
  }
  return (await res.json()) as SumupCheckoutResponse
}

/** POST /token — refresca access_token con el refresh_token. */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<SumupOauthTokens> {
  const res = await fetch(`${SUMUP_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new SumupApiError(res.status, `SumUp token refresh failed: ${body.slice(0, 300)}`, body)
  }
  return (await res.json()) as SumupOauthTokens
}

/**
 * Wrapper que asegura un access_token válido para `clientId`. Si está
 * expirado o por expirar (margen 60s), lo refresca y persiste el nuevo en
 * `clients` antes de devolverlo. Caller usa el token devuelto sin
 * preocuparse de la expiración.
 */
export async function ensureValidAccessToken(args: {
  clientId: string
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
  oauthClientId: string
  oauthClientSecret: string
  /** Función para persistir tokens nuevos. Inyectada para evitar
   *  dependencia circular con db en este módulo puro. */
  persist: (next: { accessToken: string; refreshToken: string; expiresAt: Date }) => Promise<void>
}): Promise<string> {
  const needsRefresh = !args.expiresAt || args.expiresAt.getTime() - Date.now() < 60_000
  if (!needsRefresh) return args.accessToken

  const fresh = await refreshAccessToken(args.refreshToken, args.oauthClientId, args.oauthClientSecret)
  const expiresAt = new Date(Date.now() + fresh.expires_in * 1000)
  await args.persist({
    accessToken: fresh.access_token,
    refreshToken: fresh.refresh_token,
    expiresAt,
  })
  return fresh.access_token
}
