import { cookies } from 'next/headers'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import { buildAuthorizeUrl, generateState } from '@/lib/google-business/oauth'

// -----------------------------------------------------------------------------
// GET /api/google-business/oauth/start
//
// Redirect al barbero a la pantalla de consentimiento de Google. Genera un
// `state` CSRF que persistimos en cookie httpOnly junto al clientId para
// validar al volver en el callback (mismo patrón que src/app/api/sumup/
// oauth/start/route.ts).
// -----------------------------------------------------------------------------

const STATE_COOKIE = 'google_business_oauth_state'
const CLIENT_COOKIE = 'google_business_oauth_client'

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'googleReviews')
  if (gate) return gate

  const state = generateState()
  let url: string
  try {
    url = buildAuthorizeUrl(state)
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'OAuth de Google no configurado. Contacta soporte.',
      },
      { status: 500 },
    )
  }

  const jar = await cookies()
  // Cookies cortas (5 min) — el flow termina rápido o no termina.
  const opts = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: 5 * 60,
    path: '/',
  }
  jar.set(STATE_COOKIE, state, opts)
  jar.set(CLIENT_COOKIE, access.client.id, opts)

  return Response.redirect(url, 302)
}
