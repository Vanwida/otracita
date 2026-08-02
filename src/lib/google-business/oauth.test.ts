import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAuthorizeUrl,
  generateState,
  exchangeCodeForTokens,
  refreshAccessToken,
  GoogleOauthError,
  type FetchLikeResponse,
} from './oauth.ts'

// getOauthEnv() exige estas dos vars — las fijamos aquí para que el test
// sea autocontenido y no dependa de .env.local (que `node --test` no carga).
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

test('buildAuthorizeUrl fuerza access_type=offline y prompt="consent select_account" (garantiza refresh_token + selector de cuenta)', () => {
  const url = buildAuthorizeUrl('state-123')
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('access_type'), 'offline')
  // Space-delimited list — ambos valores, sin "none" (que sí sería exclusivo).
  // consent: garantiza refresh_token. select_account: evita que Google reuse
  // en silencio la sesión de Google ya activa en el navegador del barbero
  // (que casi nunca es la cuenta que gestiona la ficha del negocio) — sin
  // esto, la primera conexión real más probable falla con "0 locations" sin
  // ninguna pista de que el problema es "cuenta equivocada".
  const promptValues = (parsed.searchParams.get('prompt') ?? '').split(' ')
  assert.deepEqual(new Set(promptValues), new Set(['consent', 'select_account']))
  assert.equal(parsed.searchParams.get('state'), 'state-123')
  assert.equal(
    parsed.searchParams.get('scope'),
    'https://www.googleapis.com/auth/business.manage',
  )
})

test('generateState produce hex de 64 caracteres, distinto cada vez', () => {
  const a = generateState()
  const b = generateState()
  assert.match(a, /^[0-9a-f]{64}$/)
  assert.notEqual(a, b)
})

test('exchangeCodeForTokens: happy path devuelve access/refresh/expiresAt', async () => {
  const fetchImpl = async () =>
    jsonResponse(200, {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/business.manage',
    })
  const tokens = await exchangeCodeForTokens('some-code', fetchImpl)
  assert.equal(tokens.accessToken, 'access-1')
  assert.equal(tokens.refreshToken, 'refresh-1')
  assert.ok(tokens.expiresAt instanceof Date)
  assert.ok(tokens.expiresAt.getTime() > Date.now())
})

test('exchangeCodeForTokens: sin refresh_token en la respuesta, lanza (no debería pasar con prompt=consent)', async () => {
  const fetchImpl = async () =>
    jsonResponse(200, { access_token: 'access-1', expires_in: 3600, scope: 'x' })
  await assert.rejects(() => exchangeCodeForTokens('some-code', fetchImpl), GoogleOauthError)
})

test('refreshAccessToken: invalid_grant expone code="invalid_grant" en el error', async () => {
  const fetchImpl = async () =>
    jsonResponse(400, { error: 'invalid_grant', error_description: 'Token has been revoked' })

  await assert.rejects(
    () => refreshAccessToken('revoked-refresh-token', fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof GoogleOauthError)
      assert.equal(err.code, 'invalid_grant')
      return true
    },
  )
})

test('refreshAccessToken: fallo transitorio (5xx) NO se marca como invalid_grant', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'internal_error' })

  await assert.rejects(
    () => refreshAccessToken('some-refresh-token', fetchImpl),
    (err: unknown) => {
      assert.ok(err instanceof GoogleOauthError)
      assert.notEqual(err.code, 'invalid_grant')
      return true
    },
  )
})

test('refreshAccessToken: happy path no incluye refresh_token nuevo (Google no rota)', async () => {
  const fetchImpl = async () =>
    jsonResponse(200, { access_token: 'access-2', expires_in: 3600, scope: 'x' })
  const result = await refreshAccessToken('same-refresh-token', fetchImpl)
  assert.equal(result.accessToken, 'access-2')
  assert.ok(result.expiresAt instanceof Date)
})
