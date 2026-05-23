import { db } from '@/db';
import { barbers, users, barberInvites } from '@/db/schema';
import { and, asc, eq, isNull, gt } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { hasFeature, upgradeRequiredResponse } from '@/lib/billing/tier';

// -----------------------------------------------------------------------------
// /api/barbers — per-client staff CRUD.
//
// GET  → list active barbers (+ inactive if ?includeInactive=1).
// POST → create a new barber (name required). Soft-create: idempotent on
//        (clientId, name) unique constraint; if the same name exists we
//        re-activate it instead of failing.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get('includeInactive') === '1';

  const rows = includeInactive
    ? await db
        .select()
        .from(barbers)
        .where(eq(barbers.clientId, access.client.id))
        .orderBy(asc(barbers.displayOrder), asc(barbers.name))
    : await db
        .select()
        .from(barbers)
        .where(and(eq(barbers.clientId, access.client.id), eq(barbers.active, true)))
        .orderBy(asc(barbers.displayOrder), asc(barbers.name));

  // Modo barbero v2 — enriquecemos cada fila con el estado de la cuenta:
  //   · `accountUserId` / `accountEmail` / `accountDisabledAt` si el
  //     barbero ya tiene cuenta Better Auth activa.
  //   · `pendingInvite` (email + expiresAt) si hay una invitación viva
  //     sin aceptar ni revocar.
  const barberIds = rows.map((r) => r.id);

  const linkedUsers = barberIds.length
    ? await db
        .select({
          id: users.id,
          email: users.email,
          barberId: users.barberId,
          disabledAt: users.disabledAt,
        })
        .from(users)
        .where(eq(users.role, 'barber'))
    : [];
  const userByBarberId = new Map<string, (typeof linkedUsers)[number]>();
  for (const u of linkedUsers) {
    if (u.barberId && barberIds.includes(u.barberId)) {
      userByBarberId.set(u.barberId, u);
    }
  }

  const now = new Date();
  const pendingInvites = barberIds.length
    ? await db
        .select({
          barberId: barberInvites.barberId,
          email: barberInvites.email,
          expiresAt: barberInvites.expiresAt,
          invitedAt: barberInvites.invitedAt,
        })
        .from(barberInvites)
        .where(
          and(
            eq(barberInvites.clientId, access.client.id),
            isNull(barberInvites.acceptedAt),
            isNull(barberInvites.revokedAt),
            gt(barberInvites.expiresAt, now),
          ),
        )
    : [];
  const inviteByBarberId = new Map<string, (typeof pendingInvites)[number]>();
  for (const inv of pendingInvites) {
    if (inv.barberId) inviteByBarberId.set(inv.barberId, inv);
  }

  const sanitized = rows.map((b) => {
    const u = userByBarberId.get(b.id) ?? null;
    const inv = inviteByBarberId.get(b.id) ?? null;
    return {
      ...b,
      account: u
        ? {
            userId: u.id,
            email: u.email,
            disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
          }
        : null,
      pendingInvite: inv
        ? {
            email: inv.email,
            expiresAt: inv.expiresAt.toISOString(),
            invitedAt: inv.invitedAt.toISOString(),
          }
        : null,
    };
  });

  return Response.json({ barbers: sanitized });
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return Response.json({ error: 'El nombre es obligatorio.' }, { status: 400 });
  }
  if (name.length > 80) {
    return Response.json({ error: 'Máximo 80 caracteres.' }, { status: 400 });
  }

  // Respect the unique (clientId, name) constraint — re-activate instead of
  // failing if the same name existed (soft-delete reversal).
  const existing = await db
    .select()
    .from(barbers)
    .where(and(eq(barbers.clientId, access.client.id), eq(barbers.name, name)));

  if (existing.length > 0) {
    const row = existing[0];
    if (!row.active) {
      await db
        .update(barbers)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(barbers.id, row.id));
    }
    return Response.json({ barber: { ...row, active: true } }, { status: 200 });
  }

  // Place new barber at the end of the display order.
  const current = await db
    .select()
    .from(barbers)
    .where(eq(barbers.clientId, access.client.id));
  const nextOrder = current.length;

  // Multi-barbero gate: tier Solo permite 1 barbero. Pro+ ilimitado.
  // Sólo bloqueamos al CREAR uno nuevo (la re-activación de uno antiguo
  // pasa por el branch de arriba y no llega aquí). La feature se llama
  // multiBarber en el catálogo y se requiere a partir del segundo.
  const activeCount = current.filter((b) => b.active).length;
  if (activeCount >= 1 && !hasFeature(access.client, 'multiBarber')) {
    return upgradeRequiredResponse('multiBarber');
  }

  const [created] = await db
    .insert(barbers)
    .values({
      clientId: access.client.id,
      name,
      displayOrder: nextOrder,
      active: true,
    })
    .returning();

  return Response.json({ barber: created }, { status: 201 });
}
