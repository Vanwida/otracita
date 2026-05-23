import { db } from '@/db';
import { tips } from '@/db/schema';
import { and, eq, isNull, desc } from 'drizzle-orm';
import {
  requireManagerPermission,
  managerPermissionErrorResponse,
} from '@/lib/manager-permissions/guard';

// -----------------------------------------------------------------------------
// GET /api/yo/tips/pending — lista de propinas (card) del tenant aún no
// liquidadas al equipo. Gated por `mark_tips_paid`. Lo usa /yo/propinas
// para que el manager las marque como pagadas en bloque.
// -----------------------------------------------------------------------------

export async function GET(req: Request) {
  const access = await requireManagerPermission(req, 'mark_tips_paid');
  if (!access.ok) return managerPermissionErrorResponse(access);
  const { client } = access;

  const rows = await db
    .select({
      id: tips.id,
      barberId: tips.barberId,
      barberName: tips.barberName,
      amountCents: tips.amountCents,
      paymentMethod: tips.paymentMethod,
      paidAt: tips.paidAt,
      bookingId: tips.bookingId,
    })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, client.id),
        eq(tips.status, 'paid'),
        isNull(tips.paidOutAt),
      ),
    )
    .orderBy(desc(tips.paidAt));

  const byBarber = new Map<
    string,
    { barberId: string | null; barberName: string; cents: number; count: number }
  >();
  for (const r of rows) {
    const key = r.barberId ?? `__${r.barberName}`;
    const cur = byBarber.get(key) ?? {
      barberId: r.barberId,
      barberName: r.barberName ?? 'Sin asignar',
      cents: 0,
      count: 0,
    };
    cur.cents += r.amountCents;
    cur.count += 1;
    byBarber.set(key, cur);
  }

  return Response.json({
    pending: rows.map((r) => ({
      id: r.id,
      barberId: r.barberId,
      barberName: r.barberName,
      amountCents: r.amountCents,
      paymentMethod: r.paymentMethod,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      bookingId: r.bookingId,
    })),
    summary: Array.from(byBarber.values()).sort((a, b) =>
      a.barberName.localeCompare(b.barberName, 'es'),
    ),
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
  });
}
