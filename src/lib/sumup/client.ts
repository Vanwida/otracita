// -----------------------------------------------------------------------------
// SumUp REST API client — wrapper finito de los endpoints que usamos.
//
// Convenciones:
//   - Todas las funciones devuelven Promise<T> con shapes tipados a lo que
//     SumUp devuelve. Si la API devuelve algo distinto (cambio de versión,
//     401, etc), throw con mensaje legible.
//   - Auth via Bearer token. Para producción multi-merchant cada client tiene
//     su propio access_token (de OAuth); para POC interno usamos la sk_test
//     desde env.
//   - Sin sandbox URL separada — SumUp usa la misma api.sumup.com con keys
//     diferenciadas (sk_test_ vs sk_live_).
// -----------------------------------------------------------------------------

const SUMUP_BASE = 'https://api.sumup.com'

export interface SumupTransaction {
  id: string
  transaction_code: string
  amount: number              // EUROS (no cents) según docs
  currency: string
  timestamp: string           // ISO 8601
  status: 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'REFUNDED' | 'CHARGE_BACK'
  payment_type: 'POS' | 'ECOM' | 'RECURRING' | 'BITCOIN' | 'DIRECT_DEBIT' | string
  product_summary?: string
  payout_date?: string
  refunded_amount?: number
  installments_count?: number
  card_type?: string
}

export interface SumupTransactionsListResponse {
  items: SumupTransaction[]
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

/** GET /v0.1/me — devuelve merchant_code y datos del perfil. */
export function getMe(token: string): Promise<SumupMeResponse> {
  return request<SumupMeResponse>('/v0.1/me', token)
}

/**
 * GET /v2.1/merchants/{code}/transactions/history
 *
 * Filtros aplicados:
 *  · changes_since: cursor para polling incremental (last_polled_at)
 *  · statuses=SUCCESSFUL,REFUNDED — ignoramos CANCELLED/FAILED
 *  · order=ascending para procesar cronológicamente
 *
 * Paginación: SumUp usa cursor `newest_ref`/`oldest_ref`. En el POC traemos
 * `limit=100` que es suficiente para 10 min de polling. Si una barbería
 * supera 100 transactions/10min necesitaremos paginar.
 */
export function listTransactionsSince(
  token: string,
  merchantCode: string,
  changesSinceIso: string | null,
  limit = 100,
): Promise<SumupTransactionsListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    order: 'ascending',
  })
  if (changesSinceIso) params.set('changes_since', changesSinceIso)
  // statuses[] repetido es la forma de pasar array según docs SumUp
  params.append('statuses[]', 'SUCCESSFUL')
  params.append('statuses[]', 'REFUNDED')

  return request<SumupTransactionsListResponse>(
    `/v2.1/merchants/${merchantCode}/transactions/history?${params.toString()}`,
    token,
  )
}

// -----------------------------------------------------------------------------
// OAuth helpers — stub para Commit 2. Aquí las firmas para que el polling
// las pueda usar en C3 sin esperar a C2.
// -----------------------------------------------------------------------------

export interface SumupOauthTokens {
  access_token: string
  refresh_token: string
  expires_in: number          // seconds
  token_type: 'Bearer'
  scope: string
}

/**
 * Refresca el access_token usando un refresh_token. SumUp requiere
 * client_id + client_secret en el body para refresh.
 */
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
