import { db } from '@/db'
import { mobileSessions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireMobileAuth, mobileAuthErrorResponse } from '@/lib/auth/mobile-session'

// -----------------------------------------------------------------------------
// POST /api/app/mobile/logout
//
// Marca la sesión móvil actual como revocada. La app borra el token del
// Keychain tras 200 OK.
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const auth = await requireMobileAuth(req)
  if (!auth.ok) return mobileAuthErrorResponse(auth)

  await db
    .update(mobileSessions)
    .set({ revokedAt: new Date() })
    .where(eq(mobileSessions.id, auth.sessionId))

  return Response.json({ ok: true })
}
