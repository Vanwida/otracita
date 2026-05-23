import { db } from '@/db';
import { barberInvites } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// POST /api/barber-invites/revoke?barberId=... — revoca TODAS las
// invitaciones vivas del barbero. Helper para el UI (un solo botón
// "Revocar" desde la card aunque haya un row pendiente sin token visible).
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  const url = new URL(req.url);
  const barberId = url.searchParams.get('barberId');
  if (!barberId) {
    return Response.json({ error: 'barberId requerido.' }, { status: 400 });
  }

  const now = new Date();
  await db
    .update(barberInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(barberInvites.clientId, access.client.id),
        eq(barberInvites.barberId, barberId),
        isNull(barberInvites.acceptedAt),
        isNull(barberInvites.revokedAt),
      ),
    );

  return Response.json({ ok: true });
}
