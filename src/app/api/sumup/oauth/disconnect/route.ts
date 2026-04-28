import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// POST /api/sumup/oauth/disconnect — el barbero revoca la integración
// SumUp desde el dashboard. Limpiamos los tokens locales.
//
// NOTA: NO llamamos a SumUp para revocar el refresh_token remoto — sería
// bonito pero añade complejidad y el barbero ya no le importa. Si el
// barbero quiere, puede revocar la app desde su panel SumUp.
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  await db
    .update(clients)
    .set({
      sumupAccessToken: null,
      sumupRefreshToken: null,
      sumupMerchantCode: null,
      sumupTokenExpiresAt: null,
      sumupReaderId: null,
      sumupReaderName: null,
    })
    .where(eq(clients.id, access.client.id))

  return Response.json({ ok: true })
}
