import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'
import { requireFeature } from '@/lib/billing/tier'

// -----------------------------------------------------------------------------
// PATCH /api/google-business/config
//
// Body: { googleReviewsAutoReply: boolean }
//
// Opt-in explícito para que el cron (api/cron/google-reviews) genere y
// publique respuestas automáticas a las reseñas de Google de este tenant.
// Conectar la cuenta (oauth/start) ya permite sincronizar reseñas; este
// flag es lo que activa que la IA responda por el barbero. Mismo patrón
// que /api/ratings/config.
// -----------------------------------------------------------------------------

interface Body {
  googleReviewsAutoReply?: unknown
}

export async function PATCH(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access
  const gate = requireFeature(client, 'googleReviews')
  if (gate) return gate

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const enabled = body.googleReviewsAutoReply === true

  await db
    .update(clients)
    .set({ googleReviewsAutoReply: enabled, updatedAt: new Date() })
    .where(eq(clients.id, client.id))

  return Response.json({ ok: true, googleReviewsAutoReply: enabled })
}
