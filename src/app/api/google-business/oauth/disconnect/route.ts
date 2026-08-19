import { db } from '@/db'
import { clients, googleReviews } from '@/db/schema'
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
      googleBusinessLocationTitle: null,
      googleBusinessConnectedAt: null,
    })
    .where(eq(clients.id, access.client.id))

  // Las filas de `google_reviews` pertenecen a la ficha que estaba conectada,
  // así que desconectar las borra. Dos motivos:
  //   1. Para el barbero, "desconectar" significa quitar esto de en medio —
  //      dejarle un listado de reseñas de Google sobre las que ya no puede
  //      actuar es confuso.
  //   2. Sin esto, desconectar y reconectar con OTRA cuenta de Google dejaría
  //      el histórico de la ficha anterior mezclado con el nuevo, y las filas
  //      'pending' viejas se intentarían publicar contra la ficha nueva hasta
  //      morir como 'failed'.
  // Si reconecta la misma ficha, todo se reconstruye solo en el siguiente
  // sync: Google conserva las reseñas y las que ya tengan respuesta se
  // detectan como respondidas.
  await db.delete(googleReviews).where(eq(googleReviews.clientId, access.client.id))

  return Response.json({ ok: true })
}
