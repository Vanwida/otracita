import { db } from '@/db';
import { barbers, barberInvites, clients, users } from '@/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// GET /api/barber-invites/[token] — público (no auth previa).
//
// Devuelve la info necesaria para renderizar la pantalla
// /aceptar-invitacion/[token]: nombre del barbero, foto, negocio, email
// pre-rellenado. NO devuelve nunca el token de vuelta ni datos del jefe.
// -----------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return Response.json({ error: 'Invitación no válida.' }, { status: 404 });
  }

  const now = new Date();
  const [invite] = await db
    .select({
      id: barberInvites.id,
      email: barberInvites.email,
      expiresAt: barberInvites.expiresAt,
      barberId: barberInvites.barberId,
      clientId: barberInvites.clientId,
    })
    .from(barberInvites)
    .where(
      and(
        eq(barberInvites.token, token),
        isNull(barberInvites.acceptedAt),
        isNull(barberInvites.revokedAt),
        gt(barberInvites.expiresAt, now),
      ),
    );

  if (!invite) {
    return Response.json(
      { error: 'Invitación no válida o caducada.' },
      { status: 404 },
    );
  }

  // Carga barber + client para mostrar foto/nombre/negocio.
  const [barber] = invite.barberId
    ? await db.select().from(barbers).where(eq(barbers.id, invite.barberId))
    : [];
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, invite.clientId));

  return Response.json({
    invite: {
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      barber: barber
        ? {
            name: barber.name,
            photoUrl: barber.photoUrl,
            role: barber.role,
          }
        : null,
      client: client
        ? {
            businessName: client.businessName,
          }
        : null,
    },
  });
}

// -----------------------------------------------------------------------------
// DELETE /api/barber-invites/[token] — el jefe revoca una invitación viva
// antes de que el barbero la acepte. Solo el tenant dueño puede revocarla.
// -----------------------------------------------------------------------------

import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  const { token } = await params;
  const [invite] = await db
    .select()
    .from(barberInvites)
    .where(eq(barberInvites.token, token));
  if (!invite) {
    return Response.json({ error: 'Invitación no encontrada.' }, { status: 404 });
  }
  if (invite.clientId !== access.client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (invite.revokedAt || invite.acceptedAt) {
    // Idempotente — ya estaba revocada o aceptada.
    return Response.json({ ok: true, alreadyClosed: true });
  }
  await db
    .update(barberInvites)
    .set({ revokedAt: new Date() })
    .where(eq(barberInvites.id, invite.id));
  // Silencia el "unused import" si users no se usa en este file (lo dejo
  // referenciado en caso de ampliar a "borrar user si existe").
  void users;
  return Response.json({ ok: true });
}
