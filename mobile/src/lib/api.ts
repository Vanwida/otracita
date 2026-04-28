import { API_BASE_URL } from './config'
import { getSessionToken, clearSession } from './session'

// -----------------------------------------------------------------------------
// API client — fetch con Bearer token automático.
//
// Si una request devuelve 401, limpiamos la sesión local (logout forzoso)
// y el caller redirige a /login.
// -----------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit & { auth?: boolean }): Promise<T> {
  const auth = init?.auth ?? true
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  }
  if (auth) {
    const token = await getSessionToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (res.status === 401 && auth) {
    await clearSession()
    throw new ApiError(401, 'Sesión expirada')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = (body as { error?: string }).error ?? `HTTP ${res.status}`
    throw new ApiError(res.status, message)
  }

  return (await res.json()) as T
}

// -----------------------------------------------------------------------------
// Endpoints específicos
// -----------------------------------------------------------------------------

export interface RedeemPinResponse {
  token: string
  business: { id: string; name: string }
}

export function redeemPin(pin: string, deviceLabel: string): Promise<RedeemPinResponse> {
  return request<RedeemPinResponse>('/api/app/mobile/pin/redeem', {
    method: 'POST',
    body: JSON.stringify({ pin, deviceLabel }),
    auth: false,
  })
}

export interface MeResponse {
  business: { id: string; name: string }
  capabilities: {
    cashRegisterEnabled: boolean
    sumupConnected: boolean
    sumupReaderPaired: boolean
    sumupReaderName: string | null
  }
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>('/api/app/mobile/me')
}

export interface BookingRow {
  id: string
  date: string
  time: string
  customerName: string | null
  customerPhone: string
  service: string
  barber: string | null
  price: number | null
  status: string
}

export interface TodayResponse {
  today: BookingRow[]
  pendingClosure: BookingRow[]
  todayDateIso: string
}

export function getToday(): Promise<TodayResponse> {
  return request<TodayResponse>('/api/app/mobile/today')
}

export interface RecordCheckoutInput {
  sumupTransactionId: string
  status: 'SUCCESSFUL' | 'CANCELLED' | 'FAILED' | 'REFUNDED'
  amountCents: number
  bookingId?: string
  reference?: string
}

export interface RecordCheckoutResponse {
  ok: boolean
  outcome: 'inserted' | 'pending' | 'duplicate' | 'ignored' | 'refund'
}

export function recordCheckout(input: RecordCheckoutInput): Promise<RecordCheckoutResponse> {
  return request<RecordCheckoutResponse>('/api/app/mobile/checkout/record', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/app/mobile/logout', { method: 'POST' })
}
