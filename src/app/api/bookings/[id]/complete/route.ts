import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  bookings,
  clients,
  payments,
  cashMovements,
  cashSessions,
} from '@/db/schema';
import {
  requireBookingOwnership,
  bookingOwnershipErrorResponse,
} from '@/lib/auth/require-booking-ownership';
import { bookingTotalCents } from '@/lib/bookings/total';
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup';
import { recordTipSequential } from '@/lib/payments/record-tip';
import { logBookingEvent, type BookingEventActor } from '@/lib/bookings/events';

// -----------------------------------------------------------------------------
// POST /api/bookings/[id]/complete (admin O barber-role) — cierre simple
// de cita con un único método de cobro (cash | card) y, opcionalmente,
// una propina cash al barbero asignado (presets físicos).
//
// Compartido entre dashboard admin y app móvil /yo:
//   · Admin → puede operar sobre cualquier booking del tenant.
//   · role='barber' → solo sobre citas con `bookings.barberId === user.barberId`.
//
// Para split payments / Stripe Checkout / casos complejos sigue existiendo
// /api/bookings/[id]/charge (admin-only). Este endpoint es el "happy
// path" rápido del barbero.
//
// Body:
//   {
//     paymentMethod: 'cash' | 'card',
//     tipCents?: number,
//     tipMethod?: 'cash' | 'card'   // default 'cash'
//   }
// -----------------------------------------------------------------------------

interface Body {
  paymentMethod?: unknown;
  tipCents?: unknown;
  tipMethod?: unknown;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;

  // Para el booking ownership necesitamos clientId. Lo resolvemos desde
  // el row a partir del bookingId — la query la hace el helper interno.
  // Truco: lookup el booking primero (sin filtrar por client) para sacar
  // clientId, y delegamos la autorización al helper.
  const [preview] = await db
    .select({ clientId: bookings.clientId })
    .from(bookings)
    .where(eq(bookings.id, bookingId));
  if (!preview) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 });
  }

  const access = await requireBookingOwnership(req, {
    clientId: preview.clientId,
    bookingId,
  });
  if (!access.ok) return bookingOwnershipErrorResponse(access);
  const { booking, user, isAdmin, barberId: actorBarberId } = access;

  if (booking.status !== 'confirmed') {
    return Response.json(
      { error: 'Solo se cobran reservas confirmadas.' },
      { status: 400 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (body.paymentMethod !== 'cash' && body.paymentMethod !== 'card') {
    return Response.json(
      { error: "paymentMethod debe ser 'cash' o 'card'." },
      { status: 400 },
    );
  }
  const method = body.paymentMethod as 'cash' | 'card';

  const tipCentsRaw = typeof body.tipCents === 'number' ? body.tipCents : 0;
  if (
    !Number.isFinite(tipCentsRaw) ||
    tipCentsRaw < 0 ||
    !Number.isInteger(tipCentsRaw)
  ) {
    return Response.json(
      { error: 'tipCents debe ser entero ≥ 0.' },
      { status: 400 },
    );
  }
  const tipCents = tipCentsRaw;
  const tipMethod = body.tipMethod === 'card' ? 'card' : ('cash' as 'cash' | 'card');

  // Carga el cliente para el resolved cashRegisterEnabled (no
  // disponible en el booking row).
  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId));
  if (!client) {
    return Response.json({ error: 'Negocio no encontrado.' }, { status: 404 });
  }

  // Resuelve el barberId para la propina:
  //   · admin                       → el de la cita.
  //   · barber actor operando su cita propia (actorBarberId === booking.barberId)
  //                                 → el suyo (= booking.barberId, equivalente).
  //   · manager con `edit_others_bookings` operando cita ajena
  //                                 → el de la cita (NUNCA acreditar al manager).
  //   Si la cita no tiene barberId, usar el del actor como último recurso.
  const tipBarberId = booking.barberId ?? actorBarberId ?? null;
  if (tipCents > 0 && !tipBarberId) {
    return Response.json(
      { error: 'No hay barbero asignado a la cita para registrar la propina.' },
      { status: 400 },
    );
  }

  const totalCents = await bookingTotalCents(bookingId);
  const now = new Date();

  // 1. Payment offline.
  await db.insert(payments).values({
    clientId: client.id,
    bookingId,
    amountCents: totalCents,
    applicationFeeCents: 0,
    currency: 'eur',
    type: 'full',
    status: 'succeeded',
    method,
    paidAt: now,
    recordedByEmail: isAdmin ? user.email : null,
    description: booking.service ?? null,
  });

  // 2. Cierra el booking.
  await db
    .update(bookings)
    .set({ status: 'completed', paymentMethod: method })
    .where(eq(bookings.id, bookingId));

  // 3. Tip (si corresponde). Resolver nombre del barbero para el snapshot
  //    del row de tips (sequence).
  let tipRecorded = false;
  if (tipCents > 0 && tipBarberId) {
    // Nombre del barbero: si actor es barber, ya lo tenemos por sesión —
    // pero recordTipSequential lo pide aquí. Buscamos el nombre.
    const { barbers } = await import('@/db/schema');
    const [b] = await db
      .select({ name: barbers.name })
      .from(barbers)
      .where(eq(barbers.id, tipBarberId));
    if (b) {
      await recordTipSequential(db, {
        clientId: client.id,
        bookingId,
        customerPhone: booking.customerPhone ?? '—',
        amountCents: tipCents,
        method: tipMethod,
        barberId: tipBarberId,
        barberName: b.name,
        cashRegisterEnabled: Boolean(client.cashRegisterEnabled),
        createdByEmail: isAdmin ? user.email : null,
      });
      tipRecorded = true;
    }
  }

  // 4. Cash movement (fire-and-forget, solo si caja activa).
  if (client.cashRegisterEnabled && totalCents > 0) {
    void (async () => {
      try {
        const [session] = await db
          .select({ id: cashSessions.id })
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.clientId, client.id),
              isNull(cashSessions.closedAt),
            ),
          );
        if (!session) return;
        await db.insert(cashMovements).values({
          clientId: client.id,
          sessionId: session.id,
          kind: 'booking',
          method,
          amountCents: totalCents,
          referenceType: 'booking',
          referenceId: bookingId,
          createdByEmail: isAdmin ? user.email : null,
        });
      } catch (err) {
        console.error('[bookings/complete] cash movement failed', err);
      }
    })();
  }

  // 4b. Log de eventos: charged + completed (task #107). Best-effort.
  {
    const eventActor: BookingEventActor = isAdmin ? 'admin' : 'barber';
    const base = {
      clientId: client.id,
      bookingId,
      actor: eventActor,
      actorLabel: user.email,
    };
    await logBookingEvent({
      ...base,
      type: 'charged',
      summary: `Cobro registrado · ${(totalCents / 100).toFixed(2)} € (${method})`,
      metadata: { amountCents: totalCents, methods: [method], tipCents: tipCents || null },
    });
    await logBookingEvent({
      ...base,
      type: 'completed',
      summary: 'Cita completada al cobrar',
    });
  }

  // 5. Followup (rating + tip request al cliente).
  tryRatingFollowupForCompletedBooking(bookingId);

  return Response.json({
    ok: true,
    bookingId,
    totalCents,
    tipRecorded,
  });
}
