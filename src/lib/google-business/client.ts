// -----------------------------------------------------------------------------
// Google Business Profile REST API client — ÚNICO módulo que habla con las
// APIs de Google Business Profile (no confundir con oauth.ts, que solo
// habla con el endpoint /token de Google OAuth).
//
// Endpoints cubiertos:
//   · GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts
//     — listar cuentas del usuario que autorizó (usado UNA vez en el
//     callback OAuth para resolver accountId).
//   · GET https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
//     — listar locations de una cuenta (usado en el callback OAuth).
//   · GET/PUT https://mybusiness.googleapis.com/v4/{location}/reviews[...]
//     — listar y responder reseñas. Sí, es la API "v4" legacy — a fecha de
//     escribir esto es la ÚNICA superficie de Google que expone reviews;
//     las APIs modulares nuevas (Account Management, Business Information)
//     todavía no tienen equivalente de reviews.
//
// Refresco de token: cada llamada que toca `mybusiness.googleapis.com/v4`
// (las que se ejecutan sin usuario delante, desde el cron) recibe un
// `GoogleBusinessCredentials` y refresca el access_token on-demand si está
// caducado o a <60s de caducar, persistiendo el nuevo token vía el callback
// `persist` inyectado por el caller (evita que este módulo dependa de `db`).
//
// Si el refresh falla con `invalid_grant` (refresh_token revocado por el
// barbero), lanzamos `GoogleBusinessRevokedError` — un tipo distinguible
// para que el cron NUNCA reintente esa reseña y en su lugar desconecte al
// tenant y avise al barbero.
//
// Testabilidad: todas las funciones aceptan un `fetchImpl` inyectable
// (default: `fetch` global) para poder testear sin red.
// -----------------------------------------------------------------------------

import { refreshAccessToken as refreshGoogleToken, GoogleOauthError, type FetchLike } from './oauth.ts'

export type { FetchLike }

const ACCOUNT_MANAGEMENT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const BUSINESS_INFORMATION_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const MYBUSINESS_V4_BASE = 'https://mybusiness.googleapis.com/v4'

/** Margen de seguridad antes de la expiración real para disparar refresh. */
const TOKEN_REFRESH_MARGIN_MS = 60_000

// -----------------------------------------------------------------------------
// Errores tipados
// -----------------------------------------------------------------------------

/**
 * El barbero revocó el acceso a Google Business Profile (o lo revocó
 * implícitamente reconectando otra cuenta). El refresh_token guardado ya no
 * sirve — NINGÚN caller debe reintentar con las mismas credenciales.
 */
export class GoogleBusinessRevokedError extends Error {
  constructor(message = 'El acceso a Google Business Profile fue revocado') {
    super(message)
    this.name = 'GoogleBusinessRevokedError'
  }
}

/** Cualquier otro fallo de la API de Google Business Profile (red, 4xx/5xx). */
export class GoogleBusinessApiError extends Error {
  status: number
  body?: unknown

  // Sin "parameter properties" de TS — Node en modo `--experimental-strip-types`
  // (strip-only) no las soporta. Ver misma nota en oauth.ts:GoogleOauthError.
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'GoogleBusinessApiError'
    this.status = status
    this.body = body
  }
}

// -----------------------------------------------------------------------------
// Credenciales + refresh on-demand
// -----------------------------------------------------------------------------

export interface GoogleBusinessCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: Date | null
  /** Persiste el access_token (+expiresAt) renovado. El refresh_token de
   *  Google normalmente no rota, así que no se re-persiste aquí. */
  persist: (next: { accessToken: string; expiresAt: Date }) => Promise<void>
}

/**
 * Exportada (no solo interna a listReviews/upsertReply) para que routes que
 * necesitan un access_token válido sin llamar todavía a un endpoint
 * concreto — p.ej. el picker de location, que llama a listAccounts/
 * listLocations directamente — puedan reusar el mismo refresh-on-demand en
 * vez de reimplementarlo.
 */
export async function ensureAccessToken(
  creds: GoogleBusinessCredentials,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const needsRefresh =
    !creds.expiresAt || creds.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_MARGIN_MS
  if (!needsRefresh) return creds.accessToken

  let fresh
  try {
    fresh = await refreshGoogleToken(creds.refreshToken, fetchImpl)
  } catch (err) {
    if (err instanceof GoogleOauthError && err.code === 'invalid_grant') {
      throw new GoogleBusinessRevokedError()
    }
    throw err
  }

  await creds.persist({ accessToken: fresh.accessToken, expiresAt: fresh.expiresAt })
  return fresh.accessToken
}

async function request<T>(
  url: string,
  accessToken: string,
  fetchImpl: FetchLike,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new GoogleBusinessApiError(
      res.status,
      `Google Business API ${res.status} en ${url}: ${body.slice(0, 300)}`,
      body,
    )
  }
  return (await res.json()) as T
}

// -----------------------------------------------------------------------------
// Account Management / Business Information — solo se usan una vez, en el
// callback OAuth, para resolver accounts/{id}/locations/{id}.
// -----------------------------------------------------------------------------

export interface GoogleBusinessAccount {
  name: string // "accounts/{accountId}"
  accountName?: string
  type?: string
}

export interface GoogleBusinessLocationSummary {
  name: string // "accounts/{accountId}/locations/{locationId}"
  title?: string
}

export async function listAccounts(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleBusinessAccount[]> {
  const data = await request<{ accounts?: GoogleBusinessAccount[] }>(
    `${ACCOUNT_MANAGEMENT_BASE}/accounts`,
    accessToken,
    fetchImpl,
  )
  return data.accounts ?? []
}

/**
 * Lista las locations de una cuenta con `name` (path completo
 * "accounts/{accountId}/locations/{locationId}") y `title` (nombre visible,
 * p.ej. "Barbería X — Gràcia"). Es la superficie que una futura UI de
 * selección de location necesita — no añadir un wrapper aparte, construir
 * el picker directamente sobre esto.
 */
export async function listLocations(
  accessToken: string,
  accountName: string,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleBusinessLocationSummary[]> {
  const params = new URLSearchParams({ readMask: 'name,title' })
  const data = await request<{ locations?: GoogleBusinessLocationSummary[] }>(
    `${BUSINESS_INFORMATION_BASE}/${accountName}/locations?${params.toString()}`,
    accessToken,
    fetchImpl,
  )
  return data.locations ?? []
}

export type LocationSelection =
  | { kind: 'none' }
  | { kind: 'single'; location: GoogleBusinessLocationSummary }
  | { kind: 'multiple'; locations: GoogleBusinessLocationSummary[] }

/**
 * Decide qué hacer con el resultado de `listLocations` para una cuenta.
 * Extraída como función PURA (sin red, sin DB, sin next/headers) para que
 * la regla "nunca elegir una location en silencio cuando hay varias" sea
 * testeable sin mockear el callback OAuth completo — el route handler solo
 * llama a esto y hace switch sobre `.kind`.
 *
 * Por qué importa: un negocio con 2+ locations bajo la misma cuenta de
 * Google (cadena multi-local, mercado real de este producto — ver
 * STRATEGY.md) NO tiene una location "correcta por defecto". Elegir la
 * primera en silencio significa responder reseñas en nombre del local
 * equivocado — un fallo visible al cliente final del barbero, no un detalle
 * técnico. `single` es el único caso que debe auto-conectar.
 */
export function resolveLocationSelection(
  locations: GoogleBusinessLocationSummary[],
): LocationSelection {
  if (locations.length === 0) return { kind: 'none' }
  if (locations.length === 1) return { kind: 'single', location: locations[0] }
  return { kind: 'multiple', locations }
}

/**
 * Comprueba que `locationPath` es una de las locations que Google REALMENTE
 * devuelve para la cuenta de ESTE tenant — nunca nos fiamos del path que
 * manda el cliente HTTP a ciegas. Sin esto, un caller malicioso podría
 * mandar el locationPath de otra barbería en el body de
 * POST /api/google-business/oauth/locations/select y hacer que sus
 * reseñas se publiquen en el perfil de Google de un negocio ajeno — un
 * escape de multi-tenancy real, no solo teórico. Función pura: recibe la
 * lista ya resuelta por listLocations(), no llama a Google ella misma.
 */
export function isLocationOwnedByAccount(
  locationPath: string,
  accountLocations: GoogleBusinessLocationSummary[],
): boolean {
  return accountLocations.some((l) => l.name === locationPath)
}

/**
 * ¿La location elegida ahora es distinta de la que ya tenía el tenant?
 * Función PURA — la usa POST .../locations/select para decidir si debe
 * purgar las filas de `google_reviews` antes de guardar el nuevo path (ver
 * comentario junto al `db.delete` en esa route para el porqué del borrado).
 *
 * `previousPath = null` (tenant que nunca había fijado location, o venía
 * del estado "conectado pero pendiente de elegir") cuenta como cambio
 * (true) por comparación directa — en la práctica no hay filas que purgar
 * en ese caso porque el sync nunca corre sin `locationPath`, así que el
 * `true` es inofensivo, no un caso especial que haya que tratar aparte.
 */
export function hasLocationChanged(previousPath: string | null, nextPath: string): boolean {
  return previousPath !== nextPath
}

/**
 * Decide si una reseña es candidata a respuesta automática (IA), en base a
 * si se creó DESPUÉS de que el barbero conectara Google Business Profile.
 *
 * Por qué existe esta función: sin ella, conectar una barbería con años de
 * antigüedad y, digamos, 180 reseñas históricas dispara ~150 respuestas
 * automáticas (las de 4-5★) en el primer sync — Google avisa por email a
 * cada uno de esos 150 reseñadores de un corte de hace dos años, y ese
 * volumen repentino en un perfil dormido es exactamente la señal que los
 * sistemas antispam de Google penalizan. El barbero solo esperaba que se
 * respondieran las reseñas NUEVAS al activar el toggle, no todo su
 * histórico. `sync.ts` usa esto para decidir el `replyStatus` inicial de
 * cada reseña nueva que ve por primera vez: `pending` (elegible) si es
 * posterior a la conexión, `skipped` (histórica, nunca auto-respondida)
 * si no. La reseña se guarda igual en ambos casos — solo cambia si el
 * cron la toca.
 *
 * `connectedAt = null` (no debería pasar una vez conectado, pero el campo
 * es nullable en el schema) se trata como "nada es elegible" — el default
 * seguro es no disparar nada si no sabemos desde cuándo contar.
 */
export function isReviewEligibleForAutoReply(
  reviewCreatedAt: Date,
  connectedAt: Date | null,
): boolean {
  if (!connectedAt) return false
  return reviewCreatedAt.getTime() > connectedAt.getTime()
}

// -----------------------------------------------------------------------------
// Reviews (v4) — normalización de starRating + list/reply.
// -----------------------------------------------------------------------------

const STAR_RATING_MAP: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

/** Normaliza el enum `starRating` de Google ("ONE".."FIVE") a un entero 1-5.
 *  Lanza si Google devuelve algo inesperado (p.ej. STAR_RATING_UNSPECIFIED) —
 *  el caller (listReviews) atrapa esto por reseña individual para no tirar
 *  todo el sync por una fila rara. */
export function normalizeStarRating(rating: string): number {
  const n = STAR_RATING_MAP[rating]
  if (!n) throw new Error(`starRating de Google desconocido: "${rating}"`)
  return n
}

interface GoogleReviewRaw {
  reviewId: string
  reviewer?: { displayName?: string; isAnonymous?: boolean }
  starRating: string
  comment?: string
  createTime: string
  updateTime: string
  reviewReply?: { comment: string; updateTime: string }
}

export interface NormalizedGoogleReview {
  googleReviewId: string
  reviewerName: string | null
  starRating: number
  comment: string | null
  reviewCreatedAt: Date
  reviewUpdatedAt: Date
  /** Presente cuando Google YA muestra una respuesta para esta reseña — casi
   *  siempre significa que el barbero respondió a mano desde la app/web de
   *  Google (o que es el eco de una respuesta que nosotros publicamos). */
  reviewReply: { comment: string; updatedAt: Date } | null
}

function normalizeReview(raw: GoogleReviewRaw): NormalizedGoogleReview {
  return {
    googleReviewId: raw.reviewId,
    reviewerName: raw.reviewer?.displayName?.trim() || null,
    starRating: normalizeStarRating(raw.starRating),
    comment: raw.comment?.trim() || null,
    reviewCreatedAt: new Date(raw.createTime),
    reviewUpdatedAt: new Date(raw.updateTime),
    reviewReply: raw.reviewReply
      ? { comment: raw.reviewReply.comment, updatedAt: new Date(raw.reviewReply.updateTime) }
      : null,
  }
}

/**
 * Lista TODAS las reseñas de una location (pagina internamente). Refresca
 * el access_token si hace falta antes de la primera llamada.
 */
export async function listReviews(
  creds: GoogleBusinessCredentials,
  locationPath: string,
  fetchImpl: FetchLike = fetch,
): Promise<NormalizedGoogleReview[]> {
  const accessToken = await ensureAccessToken(creds, fetchImpl)

  const reviews: NormalizedGoogleReview[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams()
    if (pageToken) params.set('pageToken', pageToken)
    const query = params.toString() ? `?${params.toString()}` : ''
    const data = await request<{ reviews?: GoogleReviewRaw[]; nextPageToken?: string }>(
      `${MYBUSINESS_V4_BASE}/${locationPath}/reviews${query}`,
      accessToken,
      fetchImpl,
    )
    for (const raw of data.reviews ?? []) {
      try {
        reviews.push(normalizeReview(raw))
      } catch (err) {
        // Una reseña con starRating inesperado no debe tirar el sync entero
        // de la barbería — la omitimos y seguimos con el resto.
        console.error(
          '[google-business/client] reseña omitida (starRating inesperado):',
          raw.reviewId,
          err,
        )
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return reviews
}

/**
 * Publica (o reemplaza) la respuesta a una reseña. Google trata este
 * endpoint como upsert: PUT sobre una reseña ya respondida SOBRESCRIBE la
 * respuesta anterior — por eso el caller debe ser el único punto que
 * decide publicar (nunca llamar dos veces sin querer pisar una respuesta
 * manual del barbero).
 */
export async function upsertReply(
  creds: GoogleBusinessCredentials,
  locationPath: string,
  reviewId: string,
  comment: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const accessToken = await ensureAccessToken(creds, fetchImpl)
  await request<unknown>(
    `${MYBUSINESS_V4_BASE}/${locationPath}/reviews/${reviewId}/reply`,
    accessToken,
    fetchImpl,
    { method: 'PUT', body: JSON.stringify({ comment }) },
  )
}
