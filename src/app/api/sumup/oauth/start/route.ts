import { cookies } from 'next/headers'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { buildAuthorizeUrl, generateState } from '@/lib/sumup/oauth'

// -----------------------------------------------------------------------------
// GET /api/sumup/oauth/start
//
// Redirect al barbero a la pantalla de consentimiento de SumUp. Genera
// un `state` CSRF que persistimos en cookie httpOnly junto al clientId
// para validar al volver al callback (evita que un atacante mande al
// barbero un callback con code de otra cuenta).
// -----------------------------------------------------------------------------

const STATE_COOKIE = 'sumup_oauth_state'
const CLIENT_COOKIE = 'sumup_oauth_client'

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

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
            : 'OAuth no configurado. Contacta soporte.',
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
