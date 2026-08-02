import { cookies } from 'next/headers'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { exchangeCodeForTokens } from '@/lib/google-business/oauth'
import { listAccounts, listLocations, resolveLocationSelection } from '@/lib/google-business/client'
import { siteUrl } from '@/lib/site'

// -----------------------------------------------------------------------------
// GET /api/google-business/oauth/callback?code=...&state=...
//
// Google redirige aquí tras el consentimiento del barbero. Mismo esqueleto
// que src/app/api/sumup/oauth/callback/route.ts:
//   1. State coincide con la cookie (anti-CSRF)
//   2. Cookie con clientId presente
//   3. Intercambio code → tokens
//   4. Resolver account + location (Account Management / Business
//      Information APIs)
//   5. Persistir tokens (+locationPath si hay una sola) en clients
//   6. Redirect al dashboard con mensaje de éxito
//
// MULTI-LOCATION: si la cuenta de Google tiene varias locations (cadena
// multi-local, mercado real de este producto — ver STRATEGY.md), este
// callback NO elige una por el barbero — ver `resolveLocationSelection` en
// client.ts para la regla y el porqué. En ese caso:
//   · SÍ guardamos los tokens (ya autenticados y reutilizables sin volver a
//     pasar por el consent screen de Google) — es una elección deliberada,
//     no un descuido: `googleBusinessLocationPath` queda null, y tanto
//     `isGoogleBusinessConnected` (sync.ts) como la query del cron exigen
//     locationPath no-nulo, así que este tenant queda automáticamente
//     excluido de cualquier sync/publish mientras esté en este estado
//     intermedio — cero riesgo de responder desde el local equivocado.
//   · NO guardamos `googleBusinessConnectedAt` — ese timestamp representa
//     "conectado y listo para sincronizar", que todavía no es el caso.
//   · Redirigimos con `reason=multiple-locations`. La UI de selección
//     (fuera de este módulo, en construcción en paralelo) puede re-derivar
//     accountName con `listAccounts(accessToken)` (barato, no requiere
//     re-consentimiento) y volver a llamar a `listLocations` +
//     `resolveLocationSelection` para pintar el picker, usando los tokens
//     ya guardados aquí.
// -----------------------------------------------------------------------------

const STATE_COOKIE = 'google_business_oauth_state'
const CLIENT_COOKIE = 'google_business_oauth_client'
const REDIRECT_BASE = '/dashboard/marketing/resenas'

function failRedirect(reason: string): Response {
  const params = new URLSearchParams({ google_business: 'error', reason })
  return Response.redirect(siteUrl(`${REDIRECT_BASE}?${params.toString()}`), 302)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return failRedirect(`google-error-${error}`)
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
    console.error('[google-business/callback] token exchange failed:', err)
    return failRedirect('token-exchange-failed')
  }

  // Resolver account (primera cuenta del usuario que autorizó).
  let accountName: string
  try {
    const accounts = await listAccounts(tokens.accessToken)
    if (accounts.length === 0) return failRedirect('no-accounts')
    accountName = accounts[0].name
  } catch (err) {
    console.error('[google-business/callback] listAccounts failed:', err)
    return failRedirect('accounts-failed')
  }

  // Resolver location — ver nota MULTI-LOCATION arriba.
  let locations: Awaited<ReturnType<typeof listLocations>>
  try {
    locations = await listLocations(tokens.accessToken, accountName)
  } catch (err) {
    console.error('[google-business/callback] listLocations failed:', err)
    return failRedirect('locations-failed')
  }

  const selection = resolveLocationSelection(locations)

  if (selection.kind === 'none') return failRedirect('no-locations')

  if (selection.kind === 'multiple') {
    // Guardamos los tokens pero NO locationPath/connectedAt — ver nota
    // MULTI-LOCATION arriba para el porqué.
    await db
      .update(clients)
      .set({
        googleBusinessAccessToken: tokens.accessToken,
        googleBusinessRefreshToken: tokens.refreshToken,
        googleBusinessTokenExpiresAt: tokens.expiresAt,
      })
      .where(eq(clients.id, clientId))

    jar.delete(STATE_COOKIE)
    jar.delete(CLIENT_COOKIE)

    return failRedirect('multiple-locations')
  }

  // Persistir en clients — único caso de auto-conexión completa.
  await db
    .update(clients)
    .set({
      googleBusinessAccessToken: tokens.accessToken,
      googleBusinessRefreshToken: tokens.refreshToken,
      googleBusinessTokenExpiresAt: tokens.expiresAt,
      googleBusinessLocationPath: selection.location.name,
      googleBusinessLocationTitle: selection.location.title ?? null,
      googleBusinessConnectedAt: new Date(),
    })
    .where(eq(clients.id, clientId))

  // Limpiar cookies
  jar.delete(STATE_COOKIE)
  jar.delete(CLIENT_COOKIE)

  return Response.redirect(siteUrl(`${REDIRECT_BASE}?google_business=connected`), 302)
}
