import { db } from '@/db';
import { tips } from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  requireManagerPermission,
  managerPermissionErrorResponse,
} from '@/lib/manager-permissions/guard';
import {
  validatePayoutBody,
  validatePayoutRows,
} from '@/lib/tips/payout-validation';

// -----------------------------------------------------------------------------
// POST /api/yo/tips/payout (#72) — variante de /api/tips/payout que un
// barbero Manager con `mark_tips_paid` puede invocar desde /yo/propinas.
// Misma lógica de validación + UPDATE batch. Sólo cambia el guard y
// `paidOutByEmail` queda como "[nombre del manager] <email>" para audit.
// -----------------------------------------------------------------------------

export async function POST(req: Request) {
  const access = await requireManagerPermission(req, 'mark_tips_paid');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client, barber, user } = access;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = validatePayoutBody(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const { tipIds, method } = parsed;

  const rows = await db
    .select({
      id: tips.id,
      amountCents: tips.amountCents,
      status: tips.status,
      paymentMethod: tips.paymentMethod,
      paidOutAt: tips.paidOutAt,
    })
    .from(tips)
    .where(and(eq(tips.clientId, client.id), inArray(tips.id, tipIds)));

  const err = validatePayoutRows(rows, tipIds.length, method);
  if (err) return Response.json({ error: err.error }, { status: err.status });

  const now = new Date();
  const paidOutByEmail = `${barber.name} <${user.email}>`;
  const updated = await db
    .update(tips)
    .set({
      paidOutAt: now,
      paidOutMethod: method,
      paidOutByEmail,
      updatedAt: now,
    })
    .where(
      and(
        eq(tips.clientId, client.id),
        inArray(tips.id, tipIds),
        isNull(tips.paidOutAt),
      ),
    )
    .returning({ id: tips.id, amountCents: tips.amountCents });

  const totalCents = updated.reduce((acc, r) => acc + r.amountCents, 0);

  return Response.json({ updated: updated.length, totalCents }, { status: 200 });
}
