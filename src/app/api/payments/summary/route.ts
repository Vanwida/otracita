import { db } from '@/db';
import { payments } from '@/db/schema';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// GET /api/payments/summary
//
// Dashboard summary for the "Cobros online" card in /dashboard/mi-plan:
//  - total received this month (cents) — sum of succeeded payments
//  - number of successful transactions this month
//  - application fees paid to otracita this month (cents)
//  - up to 10 most recent transactions (any status)
// -----------------------------------------------------------------------------
export async function GET(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client } = access;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [totalsRow] = await db
    .select({
      totalCents: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int`,
      feeCents: sql<number>`COALESCE(SUM(${payments.applicationFeeCents}), 0)::int`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.clientId, client.id),
        eq(payments.status, 'succeeded'),
        gte(payments.paidAt, monthStart),
      ),
    );

  const recent = await db
    .select()
    .from(payments)
    .where(eq(payments.clientId, client.id))
    .orderBy(desc(payments.createdAt))
    .limit(10);

  return Response.json({
    month: {
      totalCents: Number(totalsRow?.totalCents ?? 0),
      feeCents: Number(totalsRow?.feeCents ?? 0),
      count: Number(totalsRow?.count ?? 0),
    },
    recent: recent.map((p) => ({
      id: p.id,
      bookingId: p.bookingId,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      description: p.description,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    })),
  });
}
