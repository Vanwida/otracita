// -----------------------------------------------------------------------------
// Reacción compartida a un refresh_token revocado (GoogleBusinessRevokedError).
//
// Extraído en su propio módulo porque son 3 call sites: el cron
// (src/app/api/cron/google-reviews/route.ts) y las dos routes de selección
// de location (src/app/api/google-business/oauth/locations/*). Todos deben
// reaccionar EXACTAMENTE igual — null los 3 tokens + avisar al barbero por
// email para que reconecte — así que "igual que el cron" es una garantía de
// código compartido, no de que cada caller lo copie bien a mano.
// -----------------------------------------------------------------------------

import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { sendGoogleBusinessReconnectEmail } from './emails'

type RevocableClient = Pick<typeof clients.$inferSelect, 'id' | 'email' | 'businessName'>

export async function handleGoogleBusinessRevoked(client: RevocableClient): Promise<void> {
  await db
    .update(clients)
    .set({
      googleBusinessAccessToken: null,
      googleBusinessRefreshToken: null,
      googleBusinessTokenExpiresAt: null,
    })
    .where(eq(clients.id, client.id))

  await sendGoogleBusinessReconnectEmail({
    to: client.email,
    businessName: client.businessName,
  })
}
