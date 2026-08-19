import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeStarRating,
  listReviews,
  upsertReply,
  resolveLocationSelection,
  isLocationOwnedByAccount,
  isReviewEligibleForAutoReply,
  hasLocationChanged,
  GoogleBusinessRevokedError,
  GoogleBusinessApiError,
  type GoogleBusinessCredentials,
  type GoogleBusinessLocationSummary,
} from './client.ts'
import type { FetchLikeResponse } from './oauth.ts'

process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'

function jsonResponse(status: number, body: unknown): FetchLikeResponse {
  const text = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => body,
  }
}

/** Credenciales con access_token vigente — ensureAccessToken no debe
 *  refrescar, así que el fetchImpl de estos tests solo necesita responder
 *  al endpoint de reviews/reply, nunca al de /token. */
const FRESH_CREDS: GoogleBusinessCredentials = {
  accessToken: 'access-token-valid',
  refreshToken: 'refresh-token-valid',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  persist: async () => {
    throw new Error('persist no debería llamarse con un token todavía vigente')
  },
}

// -----------------------------------------------------------------------------
// normalizeStarRating
// -----------------------------------------------------------------------------

test('normalizeStarRating mapea el enum de Google a entero 1-5', () => {
  assert.equal(normalizeStarRating('ONE'), 1)
  assert.equal(normalizeStarRating('TWO'), 2)
  assert.equal(normalizeStarRating('THREE'), 3)
  assert.equal(normalizeStarRating('FOUR'), 4)
  assert.equal(normalizeStarRating('FIVE'), 5)
})

test('normalizeStarRating lanza con un valor desconocido', () => {
  assert.throws(() => normalizeStarRating('STAR_RATING_UNSPECIFIED'))
  assert.throws(() => normalizeStarRating('SEIS'))
  assert.throws(() => normalizeStarRating(''))
})

// -----------------------------------------------------------------------------
// listReviews — normalización de reseñas reales (sin comentario, anónimas,
// con respuesta manual ya puesta)
// -----------------------------------------------------------------------------

test('listReviews: reseña sin comentario y con reviewer anónimo se normaliza a null, no explota', async () => {
  const fetchImpl = async (url: string) => {
    assert.match(url, /\/reviews$/)
    return jsonResponse(200, {
      reviews: [
        {
          reviewId: 'r1',
          starRating: 'FIVE',
          createTime: '2026-01-01T10:00:00Z',
          updateTime: '2026-01-01T10:00:00Z',
          reviewer: { isAnonymous: true }, // sin displayName — muy común
          // sin `comment` — la mayoría de reseñas reales no traen texto
        },
      ],
    })
  }
  const reviews = await listReviews(FRESH_CREDS, 'accounts/1/locations/2', fetchImpl)
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].comment, null)
  assert.equal(reviews[0].reviewerName, null)
  assert.equal(reviews[0].starRating, 5)
  assert.equal(reviews[0].reviewReply, null)
})

test('listReviews: detecta reviewReply existente (respuesta manual del barbero desde Google)', async () => {
  const fetchImpl = async () =>
    jsonResponse(200, {
      reviews: [
        {
          reviewId: 'r2',
          starRating: 'TWO',
          comment: 'Regular, esperé mucho',
          createTime: '2026-01-01T10:00:00Z',
          updateTime: '2026-01-01T10:00:00Z',
          reviewer: { displayName: 'Juan' },
          reviewReply: { comment: 'Gracias Juan, lo tenemos en cuenta', updateTime: '2026-01-02T10:00:00Z' },
        },
      ],
    })
  const reviews = await listReviews(FRESH_CREDS, 'accounts/1/locations/2', fetchImpl)
  assert.equal(reviews[0].reviewerName, 'Juan')
  assert.equal(reviews[0].reviewReply?.comment, 'Gracias Juan, lo tenemos en cuenta')
})

test('listReviews: una reseña con starRating inesperado se omite sin tirar el resto del sync', async () => {
  const fetchImpl = async () =>
    jsonResponse(200, {
      reviews: [
        {
          reviewId: 'bad',
          starRating: 'STAR_RATING_UNSPECIFIED',
          createTime: '2026-01-01T10:00:00Z',
          updateTime: '2026-01-01T10:00:00Z',
        },
        {
          reviewId: 'good',
          starRating: 'FOUR',
          createTime: '2026-01-01T10:00:00Z',
          updateTime: '2026-01-01T10:00:00Z',
        },
      ],
    })
  const reviews = await listReviews(FRESH_CREDS, 'accounts/1/locations/2', fetchImpl)
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].googleReviewId, 'good')
})

test('listReviews: respuesta de error de Google se propaga como GoogleBusinessApiError', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'boom' })
  await assert.rejects(
    () => listReviews(FRESH_CREDS, 'accounts/1/locations/2', fetchImpl),
    GoogleBusinessApiError,
  )
})

// -----------------------------------------------------------------------------
// invalid_grant → GoogleBusinessRevokedError, y NO se reintenta
// -----------------------------------------------------------------------------

test('listReviews: invalid_grant al refrescar se propaga como GoogleBusinessRevokedError sin reintentar', async () => {
  const expiredCreds: GoogleBusinessCredentials = {
    accessToken: 'stale',
    refreshToken: 'revoked-refresh',
    expiresAt: new Date(Date.now() - 1000), // ya caducado -> fuerza refresh
    persist: async () => {
      throw new Error('persist no debería llamarse si el refresh falló')
    },
  }
  let tokenEndpointCalls = 0
  const fetchImpl = async (url: string) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      tokenEndpointCalls++
      return jsonResponse(400, { error: 'invalid_grant', error_description: 'revoked' })
    }
    throw new Error('no debería llegar a llamar a la API de reviews con el token revocado')
  }

  await assert.rejects(
    () => listReviews(expiredCreds, 'accounts/1/locations/2', fetchImpl),
    GoogleBusinessRevokedError,
  )
  // Un solo intento de refresh — el caller (cron) es quien decide qué hacer
  // con el error, este módulo nunca reintenta un invalid_grant por su cuenta.
  assert.equal(tokenEndpointCalls, 1)
})

test('upsertReply: invalid_grant también se traduce a GoogleBusinessRevokedError', async () => {
  const expiredCreds: GoogleBusinessCredentials = {
    accessToken: 'stale',
    refreshToken: 'revoked-refresh',
    expiresAt: null,
    persist: async () => {},
  }
  const fetchImpl = async (url: string) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return jsonResponse(400, { error: 'invalid_grant' })
    }
    throw new Error('no debería llegar a hacer PUT de la reply con el token revocado')
  }

  await assert.rejects(
    () => upsertReply(expiredCreds, 'accounts/1/locations/2', 'r1', 'Gracias!', fetchImpl),
    GoogleBusinessRevokedError,
  )
})

test('upsertReply: con token vigente, hace PUT con el comment en el body', async () => {
  let capturedMethod: string | undefined
  let capturedBody: string | undefined
  let capturedUrl: string | undefined
  const fetchImpl = async (url: string, init?: RequestInit) => {
    capturedUrl = url
    capturedMethod = init?.method
    capturedBody = init?.body as string
    return jsonResponse(200, { comment: 'Gracias!' })
  }
  await upsertReply(FRESH_CREDS, 'accounts/1/locations/2', 'r1', 'Gracias!', fetchImpl)
  assert.equal(capturedMethod, 'PUT')
  assert.match(capturedUrl!, /accounts\/1\/locations\/2\/reviews\/r1\/reply$/)
  assert.deepEqual(JSON.parse(capturedBody!), { comment: 'Gracias!' })
})

// -----------------------------------------------------------------------------
// resolveLocationSelection — la regla "nunca elegir en silencio entre
// varias locations" (bug real: un barbero con 2+ locales bajo la misma
// cuenta de Google se conectaba al azar al primero que devolvía la API).
// -----------------------------------------------------------------------------

const oneLocation: GoogleBusinessLocationSummary[] = [
  { name: 'accounts/1/locations/A', title: 'Barbería Centro' },
]

const twoLocations: GoogleBusinessLocationSummary[] = [
  { name: 'accounts/1/locations/A', title: 'Barbería Centro' },
  { name: 'accounts/1/locations/B', title: 'Barbería Gràcia' },
]

test('resolveLocationSelection: cero locations → kind "none"', () => {
  assert.deepEqual(resolveLocationSelection([]), { kind: 'none' })
})

test('resolveLocationSelection: una sola location → kind "single" con esa location (comportamiento sin cambios)', () => {
  const result = resolveLocationSelection(oneLocation)
  assert.equal(result.kind, 'single')
  assert.deepEqual((result as { kind: 'single'; location: GoogleBusinessLocationSummary }).location, oneLocation[0])
})

test('resolveLocationSelection: varias locations → kind "multiple", NO elige ninguna por su cuenta', () => {
  const result = resolveLocationSelection(twoLocations)
  assert.equal(result.kind, 'multiple')
  assert.deepEqual(
    (result as { kind: 'multiple'; locations: GoogleBusinessLocationSummary[] }).locations,
    twoLocations,
  )
})

// -----------------------------------------------------------------------------
// isLocationOwnedByAccount — la comprobación de seguridad multi-tenant: un
// locationPath que NO pertenece a la cuenta de Google de este tenant debe
// rechazarse. Es la aserción security-relevant explícita que pidió el
// equipo — sin esto, el body de POST .../locations/select sería confianza
// ciega en lo que manda el cliente HTTP.
// -----------------------------------------------------------------------------

test('isLocationOwnedByAccount: path presente en la cuenta → true', () => {
  assert.equal(isLocationOwnedByAccount('accounts/1/locations/A', twoLocations), true)
  assert.equal(isLocationOwnedByAccount('accounts/1/locations/B', twoLocations), true)
})

test('isLocationOwnedByAccount: path de OTRA cuenta/tenant → false (se rechaza, no se confía en el body)', () => {
  assert.equal(isLocationOwnedByAccount('accounts/999/locations/ajena', twoLocations), false)
})

test('isLocationOwnedByAccount: lista de locations vacía → siempre false', () => {
  assert.equal(isLocationOwnedByAccount('accounts/1/locations/A', []), false)
})

// -----------------------------------------------------------------------------
// isReviewEligibleForAutoReply — la regla que evita el flood de respuestas
// automáticas al histórico al conectar una barbería con años de reseñas
// (bug real: 180 reseñas → ~150 auto-respuestas de 4-5★ en el primer sync,
// 150 clientes reales notificados por Google de un corte de hace 2 años).
// Es la regla que nos protege de mandar spam masivo a clientes reales, así
// que lleva una aserción explícita.
// -----------------------------------------------------------------------------

const connectedAt = new Date('2026-06-01T12:00:00Z')

test('isReviewEligibleForAutoReply: reseña anterior a la conexión → NO elegible (histórico, se marca skipped)', () => {
  const reviewCreatedAt = new Date('2024-01-15T09:00:00Z') // años antes de conectar
  assert.equal(isReviewEligibleForAutoReply(reviewCreatedAt, connectedAt), false)
})

test('isReviewEligibleForAutoReply: reseña posterior a la conexión → elegible (pending)', () => {
  const reviewCreatedAt = new Date('2026-06-02T08:00:00Z') // un día después de conectar
  assert.equal(isReviewEligibleForAutoReply(reviewCreatedAt, connectedAt), true)
})

test('isReviewEligibleForAutoReply: reseña exactamente en el instante de conexión → NO elegible (empate va a "histórico")', () => {
  assert.equal(isReviewEligibleForAutoReply(connectedAt, connectedAt), false)
})

test('isReviewEligibleForAutoReply: connectedAt null (no debería pasar, pero es nullable en el schema) → nunca elegible', () => {
  assert.equal(isReviewEligibleForAutoReply(new Date(), null), false)
})

// -----------------------------------------------------------------------------
// hasLocationChanged — decide si POST .../locations/select debe purgar
// `google_reviews` antes de guardar el nuevo path (evita mezclar reseñas de
// la ficha vieja con la nueva, y evita que el cron intente publicar filas
// 'pending' de la ficha vieja contra el path nuevo hasta acabar en 'failed').
// -----------------------------------------------------------------------------

test('hasLocationChanged: mismo path exacto → false (re-confirmar no borra nada)', () => {
  assert.equal(hasLocationChanged('accounts/1/locations/A', 'accounts/1/locations/A'), false)
})

test('hasLocationChanged: path distinto → true (cambio real, hay que purgar)', () => {
  assert.equal(hasLocationChanged('accounts/1/locations/A', 'accounts/1/locations/B'), true)
})

test('hasLocationChanged: previousPath null (primera vez que se fija una location) → true', () => {
  assert.equal(hasLocationChanged(null, 'accounts/1/locations/A'), true)
})
