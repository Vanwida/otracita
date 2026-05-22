import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, barbers, tips } from '@/db/schema';
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access';
import { recordTipInTx } from '@/lib/payments/record-tip';

// -----------------------------------------------------------------------------
// POST /api/bookings/[id]/tip
//
// Registra una propina DESPUÉS de que el cobro del booking ya esté cerrado
// (épica Reni — flow inline: el barbero primero cobra y luego, en la
// siguiente pantalla del modal, decide la propina).
//
// Body:
//   {
//     amountCents: number (> 0),
//     method: 'cash' | 'card',
//     barberId: string (uuid),
//   }
//
// Idempotencia ligera: si ya existe un tip para este bookingId + barberId
// con `paidAt` en los últimos 5 minutos, devolvemos el existente sin
// duplicar — cubre el caso "barbero pulsa el botón de propina dos veces".
//
// Multi-tenancy: la reserva debe pertenecer al cliente autenticado. El
// barbero debe estar activo en el tenant.
// -----------------------------------------------------------------------------

interface Body {
  amountCents?: unknown;
  method?: unknown;
  barberId?: unknown;
}

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const { client, user } = access;
  const { id: bookingId } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // Validaciones básicas.
  if (
    typeof body.amountCents !== 'number' ||
    !Number.isInteger(body.amountCents) ||
    body.amountCents <= 0
  ) {
    return Response.json(
      { error: 'amountCents debe ser un entero positivo en céntimos.' },
      { status: 400 },
    );
  }
  if (body.method !== 'cash' && body.method !== 'card') {
    return Response.json(
      { error: "method debe ser 'cash' o 'card'." },
      { status: 400 },
    );
  }
  if (typeof body.barberId !== 'string' || body.barberId.trim().length === 0) {
    return Response.json({ error: 'barberId requerido.' }, { status: 400 });
  }

  // El booking debe pertenecer al tenant.
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)));
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 });
  }

  // Barbero válido + activo del tenant.
  const [barber] = await db
    .select({ id: barbers.id, name: barbers.name })
    .from(barbers)
    .where(
      and(
        eq(barbers.clientId, client.id),
        eq(barbers.id, body.barberId),
        eq(barbers.active, true),
      ),
    );
  if (!barber) {
    return Response.json(
      { error: 'Ese barbero no existe o no está activo.' },
      { status: 400 },
    );
  }

  // Idempotencia: tip reciente al mismo barbero por el mismo booking.
  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const [existing] = await db
    .select({ id: tips.id, amountCents: tips.amountCents })
    .from(tips)
    .where(
      and(
        eq(tips.clientId, client.id),
        eq(tips.bookingId, bookingId),
        eq(tips.barberId, barber.id),
        eq(tips.status, 'paid'),
        gte(tips.paidAt, since),
      ),
    );
  if (existing) {
    return Response.json(
      {
        tipId: existing.id,
        amountCents: existing.amountCents,
        deduped: true,
      },
      { status: 200 },
    );
  }

  // Insertar (transacción por consistencia con cash_movement si aplica).
  const result = await db.transaction(async (tx) => {
    return recordTipInTx(tx, {
      clientId: client.id,
      bookingId,
      customerPhone: booking.customerPhone ?? '—',
      amountCents: body.amountCents as number,
      method: body.method as 'cash' | 'card',
      barberId: barber.id,
      barberName: barber.name,
      cashRegisterEnabled: Boolean(client.cashRegisterEnabled),
      createdByEmail: user.email,
    });
  });

  return Response.json(
    {
      tipId: result.tipId,
      cashMovementId: result.cashMovementId,
      deduped: false,
    },
    { status: 201 },
  );
}
