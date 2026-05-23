import { db } from '@/db';
import { users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// POST /api/barber-account/enable — reactiva una cuenta de barbero
// previamente disabled. Body: { userId }.
// -----------------------------------------------------------------------------

interface Body {
  userId?: unknown;
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) {
    return Response.json({ error: 'userId requerido.' }, { status: 400 });
  }

  const [target] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.clientId, access.client.id),
        eq(users.role, 'barber'),
      ),
    );
  if (!target) {
    return Response.json({ error: 'Cuenta no encontrada.' }, { status: 404 });
  }

  await db
    .update(users)
    .set({ disabledAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return Response.json({ ok: true });
}
