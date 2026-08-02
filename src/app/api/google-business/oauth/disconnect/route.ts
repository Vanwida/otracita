import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// POST /api/google-business/oauth/disconnect — el barbero revoca la
// integración de Google Business Profile desde el dashboard. Limpiamos los
// tokens locales (no llamamos a Google para revocar el token remoto — mismo
// criterio que src/app/api/sumup/oauth/disconnect/route.ts).
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const gate = requireFeature(access.client, 'googleReviews')
  if (gate) return gate

  await db
    .update(clients)
    .set({
      googleBusinessAccessToken: null,
      googleBusinessRefreshToken: null,
      googleBusinessTokenExpiresAt: null,
      googleBusinessLocationPath: null,
      googleBusinessConnectedAt: null,
    })
    .where(eq(clients.id, access.client.id))

  return Response.json({ ok: true })
}
