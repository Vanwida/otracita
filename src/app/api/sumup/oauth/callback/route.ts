import { cookies } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { exchangeCodeForTokens } from '@/lib/sumup/oauth'
import { getMe } from '@/lib/sumup/client'

// -----------------------------------------------------------------------------
// GET /api/sumup/oauth/callback?code=...&state=...
//
// SumUp redirige aquí tras el consentimiento del barbero. Validamos:
//   1. State coincide con la cookie (anti-CSRF)
//   2. Cookie con clientId presente (sino redirect cruzado, abortamos)
//   3. Intercambio code → tokens
//   4. Llamada a /me para resolver merchant_code
//   5. Persistir tokens + merchant_code en clients
//   6. Redirect al dashboard con mensaje de éxito
// -----------------------------------------------------------------------------

const STATE_COOKIE = 'sumup_oauth_state'
const CLIENT_COOKIE = 'sumup_oauth_client'

function failRedirect(reason: string): Response {
  const params = new URLSearchParams({ sumup: 'error', reason })
  return Response.redirect(`/dashboard/caja?${params.toString()}`, 302)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return failRedirect(`sumup-error-${error}`)
  if (!code || !state) return failRedirect('missing-params')

  const jar = await cookies()
  const cookieState = jar.get(STATE_COOKIE)?.value
  const clientId = jar.get(CLIENT_COOKIE)?.value

  if (!cookieState || !clientId) return failRedirect('missing-cookies')
  if (cookieState !== state) return failRedirect('state-mismatch')

  // Intercambio code → tokens
  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>
  try {
    tokens = await exchangeCodeForTokens(code)
  } catch (err) {
    console.error('[sumup/callback] token exchange failed:', err)
    return failRedirect('token-exchange-failed')
  }

  // Resolver merchant_code llamando a /me
  let merchantCode: string
  try {
    const me = await getMe(tokens.accessToken)
    merchantCode = me.merchant_profile.merchant_code
  } catch (err) {
    console.error('[sumup/callback] /me failed:', err)
    return failRedirect('me-failed')
  }

  // Persistir en clients
  await db
    .update(clients)
    .set({
      sumupAccessToken: tokens.accessToken,
      sumupRefreshToken: tokens.refreshToken,
      sumupTokenExpiresAt: tokens.expiresAt,
      sumupMerchantCode: merchantCode,
      sumupLastPolledAt: null, // primer poll desde la conexión arrastrará todo
    })
    .where(eq(clients.id, clientId))

  // Limpiar cookies
  jar.delete(STATE_COOKIE)
  jar.delete(CLIENT_COOKIE)

  return Response.redirect('/dashboard/caja?sumup=connected', 302)
}
