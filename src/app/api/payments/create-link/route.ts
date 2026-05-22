import { db } from '@/db';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { validateAmountCents } from '@/lib/payments';
import {
  createStripeCheckoutForBooking,
  StripeCheckoutError,
} from '@/lib/payments/stripe-checkout';

// -----------------------------------------------------------------------------
// POST /api/payments/create-link
//
// Generates a Stripe Checkout Session (hosted payment page) for a specific
// booking and returns { paymentUrl, qrCodeDataUrl, paymentId }. Stripe Connect
// DESTINATION CHARGE: we (platform) create the charge, funds are routed to
// the barber's Connect account, application fee configurable via env.
//
// Race-condition mitigation: if a 'pending' payment already exists for this
// booking we return it instead of creating a second Stripe session. The
// barber can still "regenerate" a new link by first cancelling the pending
// one (future UI affordance).
//
// El cobro real lo encapsula `createStripeCheckoutForBooking`, reusado por el
// nuevo endpoint /api/bookings/[id]/charge (split payments).
// -----------------------------------------------------------------------------
interface CreateLinkBody {
  bookingId?: unknown;
  amountCents?: unknown;
  description?: unknown;
}

export async function POST(request: Request) {
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client, isAdmin, user } = access;

  let body: CreateLinkBody;
  try {
    body = (await request.json()) as CreateLinkBody;
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  if (!bookingId) {
    return Response.json({ error: 'Falta bookingId' }, { status: 400 });
  }

  const amountError = validateAmountCents(body.amountCents);
  if (amountError) {
    return Response.json({ error: amountError }, { status: 400 });
  }
  const amountCents = body.amountCents as number;

  const description =
    typeof body.description === 'string' && body.description.trim().length > 0
      ? body.description.trim().slice(0, 200)
      : `Servicio en ${client.businessName || 'la barbería'}`;

  // Multi-tenancy: el booking debe pertenecer al client autenticado.
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada' }, { status: 404 });
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await createStripeCheckoutForBooking({
      client,
      booking,
      amountCents,
      description,
      recordedByEmail: user.email,
    });

    return Response.json({
      paymentUrl: result.paymentUrl,
      qrCodeDataUrl: result.qrCodeDataUrl,
      paymentId: result.paymentId,
      reused: result.reused,
      amountCents: result.amountCents,
    });
  } catch (err) {
    if (err instanceof StripeCheckoutError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.error('[payments/create-link] failed:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
