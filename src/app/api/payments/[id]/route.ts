import { db } from '@/db';
import { payments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';

// -----------------------------------------------------------------------------
// GET /api/payments/:id
//
// Returns the current state of a single payment row. Used by the booking
// panel to poll after the QR is shown ("did the client pay yet?"). Enforces
// multi-tenancy — a payment row can only be read by its owning client (or an
// admin).
// -----------------------------------------------------------------------------
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client, isAdmin } = access;
  const { id } = await ctx.params;

  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  if (!row) {
    return Response.json({ error: 'Pago no encontrado' }, { status: 404 });
  }

  if (!isAdmin && row.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return Response.json({
    id: row.id,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    paymentUrl: row.paymentLinkUrl,
    paidAt: row.paidAt,
    bookingId: row.bookingId,
    description: row.description,
    createdAt: row.createdAt,
  });
}
