import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'
import {
  listAccounts,
  listLocations,
  ensureAccessToken,
  GoogleBusinessRevokedError,
  GoogleBusinessApiError,
  type GoogleBusinessCredentials,
} from '@/lib/google-business/client'
import { handleGoogleBusinessRevoked } from '@/lib/google-business/revoke'

// -----------------------------------------------------------------------------
// GET /api/google-business/oauth/locations
//
// Lista las locations de Google Business Profile disponibles para la cuenta
// que este tenant ya autorizó. Usado por la UI de selección tras el
// callback OAuth cuando la cuenta tiene varias locations (ver
// resolveLocationSelection en client.ts) — el tenant tiene tokens válidos
// pero `googleBusinessLocationPath` sigue null hasta que elija una.
//
// Response 200: { locations: { path: string; title: string }[] }
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'googleReviews')
  if (gate) return gate
  const { client } = access

  if (!client.googleBusinessAccessToken || !client.googleBusinessRefreshToken) {
    return Response.json({ error: 'not_connected' }, { status: 400 })
  }

  const creds: GoogleBusinessCredentials = {
    accessToken: client.googleBusinessAccessToken,
    refreshToken: client.googleBusinessRefreshToken,
    expiresAt: client.googleBusinessTokenExpiresAt,
    persist: async (next) => {
      await db
        .update(clients)
        .set({
          googleBusinessAccessToken: next.accessToken,
          googleBusinessTokenExpiresAt: next.expiresAt,
        })
        .where(eq(clients.id, client.id))
    },
  }

  try {
    const accessToken = await ensureAccessToken(creds)
    const accounts = await listAccounts(accessToken)
    if (accounts.length === 0) {
      return Response.json({ error: 'no_accounts' }, { status: 502 })
    }
    const locations = await listLocations(accessToken, accounts[0].name)
    return Response.json({
      locations: locations.map((l) => ({ path: l.name, title: l.title ?? l.name })),
    })
  } catch (err) {
    if (err instanceof GoogleBusinessRevokedError) {
      await handleGoogleBusinessRevoked(client)
      return Response.json({ error: 'reconnect_required' }, { status: 409 })
    }
    const status = err instanceof GoogleBusinessApiError ? err.status : 'n/a'
    console.error(`[google-business/locations] failed (status=${status}):`, err)
    return Response.json({ error: 'google_api_error' }, { status: 502 })
  }
}
