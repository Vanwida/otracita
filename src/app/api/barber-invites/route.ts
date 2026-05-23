import { db } from '@/db';
import { barbers, barberInvites, users } from '@/db/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { generateInviteToken, inviteExpiresAt } from '@/lib/barber-invites/token';
import { sendBarberInviteEmail } from '@/lib/barber-invites/email';

// -----------------------------------------------------------------------------
// /api/barber-invites — gestión de invitaciones del jefe al barbero (#71v2).
//
// POST body: { barberId: string, email: string }
//   · Valida que el barbero pertenece al tenant.
//   · Si el barbero YA tiene cuenta Better Auth viva (user.barberId =
//     barberId, no disabled) → 409 con mensaje claro.
//   · Si hay una invitación viva (no aceptada/revocada/expirada) → la
//     revocamos antes de crear una nueva (un solo "pending" por barbero).
//   · Crea row + token random hex 32 bytes + expiresAt = now()+7d.
//   · Envía email Postmark. Si Postmark falla, no falla el endpoint
//     (devolvemos `emailSent: false` y dejamos el link en la respuesta
//     para que el jefe pueda copiarlo manualmente).
// -----------------------------------------------------------------------------

interface CreateBody {
  barberId?: unknown;
  email?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const barberId = typeof body.barberId === 'string' ? body.barberId.trim() : '';
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!barberId) {
    return Response.json({ error: 'barberId requerido.' }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: 'Email no válido.' }, { status: 400 });
  }

  // 1. Verifica que el barbero pertenece a este tenant.
  const [barber] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.clientId, access.client.id)));
  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado.' }, { status: 404 });
  }

  // 2. ¿Ya tiene cuenta activa?
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.barberId, barberId));
  if (existingUser && !existingUser.disabledAt) {
    return Response.json(
      {
        error: 'Este barbero ya tiene cuenta activa.',
        accountEmail: existingUser.email,
      },
      { status: 409 },
    );
  }

  // 3. ¿Email ya tomado por otro user? Better Auth requiere email único.
  const [emailUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (emailUser && emailUser.barberId !== barberId) {
    return Response.json(
      { error: 'Ese email ya está en uso por otra cuenta.' },
      { status: 409 },
    );
  }

  // 4. Revoca invitaciones vivas previas (un solo "pending" por barbero).
  const now = new Date();
  await db
    .update(barberInvites)
    .set({ revokedAt: now })
    .where(
      and(
        eq(barberInvites.barberId, barberId),
        isNull(barberInvites.acceptedAt),
        isNull(barberInvites.revokedAt),
      ),
    );

  // 5. Crea nueva invitación.
  const token = generateInviteToken();
  const expiresAt = inviteExpiresAt(now);
  const [created] = await db
    .insert(barberInvites)
    .values({
      clientId: access.client.id,
      barberId,
      email,
      token,
      invitedByUserId: access.user.id,
      expiresAt,
    })
    .returning();

  // 6. Envía email (fire-and-await — el jefe quiere feedback inmediato).
  const emailResult = await sendBarberInviteEmail({
    to: email,
    barberName: barber.name,
    ownerName: access.client.ownerName ?? null,
    businessName: access.client.businessName ?? null,
    token,
  });

  return Response.json(
    {
      invite: {
        id: created.id,
        email: created.email,
        expiresAt: created.expiresAt.toISOString(),
        token,
      },
      emailSent: emailResult.ok,
      emailSkipped: !emailResult.ok && 'skipped' in emailResult && emailResult.skipped,
    },
    { status: 201 },
  );
}

// -----------------------------------------------------------------------------
// GET /api/barber-invites?barberId=... — devuelve la invitación viva
// (si la hay) del barbero. Útil para el UI del editor de equipo.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  const url = new URL(req.url);
  const barberId = url.searchParams.get('barberId');
  if (!barberId) {
    return Response.json({ error: 'barberId requerido.' }, { status: 400 });
  }

  const [barber] = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.id, barberId), eq(barbers.clientId, access.client.id)));
  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado.' }, { status: 404 });
  }

  const now = new Date();
  const [invite] = await db
    .select({
      id: barberInvites.id,
      email: barberInvites.email,
      invitedAt: barberInvites.invitedAt,
      expiresAt: barberInvites.expiresAt,
    })
    .from(barberInvites)
    .where(
      and(
        eq(barberInvites.barberId, barberId),
        isNull(barberInvites.acceptedAt),
        isNull(barberInvites.revokedAt),
        gt(barberInvites.expiresAt, now),
      ),
    );

  return Response.json({
    invite: invite
      ? {
          id: invite.id,
          email: invite.email,
          invitedAt: invite.invitedAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
        }
      : null,
  });
}
