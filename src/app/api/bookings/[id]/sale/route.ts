import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  bookings,
  barbers,
  payments,
  tips,
  invoices,
  cashMovements,
  cashSessions,
} from '@/db/schema';
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
} from '@/lib/auth/require-tenant-actor';
import { bookingTotalCents } from '@/lib/bookings/total';
import {
  isPaymentMethod,
  CASH_MOVEMENT_METHOD_FROM_PAYMENT,
  type PaymentMethod,
} from '@/lib/payments/methods';

// -----------------------------------------------------------------------------
// PATCH /api/bookings/[id]/sale — editar una venta YA COBRADA cuando aún no
// se ha emitido factura VeriFactu (caso típico Reni: precio mal puesto,
// cliente equivocado, método de cobro erróneo, propina mal cuadrada).
//
// VeriFactu (RD 1007/2023) prohíbe modificar facturas emitidas — esas se
// rectifican con factura rectificativa. Este endpoint NO toca documentos
// fiscales: solo opera sobre bookings + payments + tips + cash_movements
// para corregir errores antes de que la venta se haya facturado.
//
// Reglas duras:
//   · Solo bookings con status='completed' y NO source='booksy'.
//   · NO debe existir invoice issued/rectified asociada (refuse → rectificativa).
//   · NO debe existir payment con stripeChargeId o sumupTransactionId — esos
//     son cobros reales con proveedor externo; cambiar el método requeriría
//     reembolsar primero. UI debe filtrar este caso, el endpoint lo blinda.
//
// Body (todos opcionales; lo que viene se aplica, el resto se conserva):
//   {
//     customerName?:  string | null
//     customerPhone?: string
//     service?:       string
//     price?:         number | null   // EUROS (foot-gun bookings.price)
//     paymentMethod?: PaymentMethod    // sustituye la línea de payment única
//     paymentNotes?:  string           // libre, se persiste en payments.notes
//     tip?: { amountCents: number; method: 'cash'|'card'; barberId: string } | null
//   }
//
// Estrategia (sin transacción real — neon-http no la soporta, mismo patrón
// que /api/bookings/[id]/charge y record-tip):
//   1. Cargar booking + validar tenant + ownership + estado editable.
//   2. Detectar si hay invoice o pagos con proveedor externo → 409.
//   3. Actualizar columnas de bookings cambiadas (incluye paymentMethod).
//   4. Si cambia precio/método: rebuild de la fila offline de payments
//      (delete las sin proveedor + insert UNA nueva con el total real).
//   5. Reescribir cash_movement del booking en la sesión abierta (delete
//      previo del mismo referenceId+kind='booking' y reinserción).
//   6. Tip: upsert (delete previo + insert si amountCents>0) + rebuild
//      cash_movement kind='tip_cash' del booking.
//
// Multi-tenancy: requireTenantActor + ownership barber.
// -----------------------------------------------------------------------------

interface SaleEditTipBody {
  amountCents: number;
  method: 'cash' | 'card';
  barberId: string;
}

interface SaleEditBody {
  customerName?: unknown;
  customerPhone?: unknown;
  service?: unknown;
  price?: unknown;
  paymentMethod?: unknown;
  paymentNotes?: unknown;
  /** `null` borra la propina (refund interno: borra la fila + cash_movement). */
  tip?: SaleEditTipBody | null;
}

function isTipPayload(v: unknown): v is SaleEditTipBody {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.amountCents === 'number' &&
    Number.isInteger(t.amountCents) &&
    t.amountCents > 0 &&
    (t.method === 'cash' || t.method === 'card') &&
    typeof t.barberId === 'string' &&
    t.barberId.trim().length > 0
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireTenantActor(req);
  if (!access.ok) return tenantActorErrorResponse(access);
  const { client, user } = access;
  const { id: bookingId } = await params;

  let body: SaleEditBody;
  try {
    body = (await req.json()) as SaleEditBody;
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // ── Cargar booking + tenant + ownership ─────────────────────────────────
  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)));
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 });
  }

  if (!access.isAdmin && access.barberId) {
    const canEditOthers = actorHasManagerPermission(access, 'edit_others_bookings');
    if (!canEditOthers && booking.barberId !== access.barberId) {
      return Response.json({ error: 'Esta cita no es tuya.' }, { status: 403 });
    }
  }

  // ── Estado editable ─────────────────────────────────────────────────────
  if (booking.status !== 'completed') {
    return Response.json(
      {
        error:
          'Solo se editan ventas ya cobradas. Para citas confirmadas usa "Editar servicio o precio".',
      },
      { status: 409 },
    );
  }
  if (booking.source === 'booksy') {
    return Response.json(
      {
        error:
          'Las citas importadas de Booksy son solo lectura. Edita el original en Booksy.',
      },
      { status: 409 },
    );
  }

  // ── Bloqueo fiscal: factura VeriFactu activa → rectificativa ───────────
  // status 'voided' no obliga (no hay doc vivo); 'issued'/'rectified' sí.
  const invoiceRows = await db
    .select({ id: invoices.id, status: invoices.status })
    .from(invoices)
    .where(
      and(eq(invoices.bookingId, bookingId), eq(invoices.clientId, client.id)),
    );
  const hasLiveInvoice = invoiceRows.some(
    (r) => r.status === 'issued' || r.status === 'rectified',
  );
  if (hasLiveInvoice) {
    return Response.json(
      {
        error:
          'Esta venta tiene factura emitida. Para corregirla emite una rectificativa.',
        code: 'invoice_locked',
      },
      { status: 409 },
    );
  }

  // ── Cobros externos (Stripe / SumUp) → no editables sin refund ─────────
  const allPayments = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.bookingId, bookingId), eq(payments.clientId, client.id)),
    );
  const externalLocked = allPayments.find(
    (p) =>
      p.status !== 'cancelled' &&
      p.status !== 'failed' &&
      p.status !== 'refunded' &&
      (p.stripeChargeId || p.sumupTransactionId),
  );
  if (externalLocked) {
    return Response.json(
      {
        error:
          'Esta venta tiene un cobro real con Stripe o datáfono. Reembolsa antes de cambiarla.',
        code: 'external_payment_locked',
      },
      { status: 409 },
    );
  }

  // ── Validar inputs ─────────────────────────────────────────────────────
  // No usamos `updatedAt` — la tabla `bookings` no tiene esa columna; el
  // PATCH principal lo añade vía un cast a Record<string, unknown> que
  // Drizzle ignora silenciosamente. Aquí mantenemos el patch tipado limpio.
  const bookingPatch: Record<string, unknown> = {};
  let priceChanged = false;
  let methodChanged = false;
  let nextPaymentMethod: PaymentMethod | null = null;

  if ('customerName' in body) {
    if (body.customerName === null) {
      bookingPatch.customerName = null;
    } else if (typeof body.customerName === 'string') {
      const trimmed = body.customerName.trim();
      bookingPatch.customerName = trimmed.length > 0 ? trimmed : null;
    } else {
      return Response.json(
        { error: 'customerName debe ser string o null.' },
        { status: 400 },
      );
    }
  }

  if ('customerPhone' in body) {
    if (typeof body.customerPhone !== 'string' || body.customerPhone.trim().length === 0) {
      return Response.json(
        { error: 'customerPhone debe ser un string no vacío.' },
        { status: 400 },
      );
    }
    bookingPatch.customerPhone = body.customerPhone.trim();
  }

  if ('service' in body) {
    if (typeof body.service !== 'string' || body.service.trim().length === 0) {
      return Response.json(
        { error: 'service debe ser un string no vacío.' },
        { status: 400 },
      );
    }
    bookingPatch.service = body.service.trim();
  }

  if ('price' in body) {
    if (body.price === null) {
      bookingPatch.price = null;
      priceChanged = booking.price !== null;
    } else if (
      typeof body.price === 'number' &&
      Number.isFinite(body.price) &&
      body.price >= 0
    ) {
      const intPrice = Math.round(body.price);
      bookingPatch.price = intPrice;
      priceChanged = booking.price !== intPrice;
    } else {
      return Response.json(
        { error: 'price debe ser un número >= 0 o null.' },
        { status: 400 },
      );
    }
  }

  if ('paymentMethod' in body) {
    if (!isPaymentMethod(body.paymentMethod)) {
      return Response.json(
        { error: 'paymentMethod inválido.' },
        { status: 400 },
      );
    }
    nextPaymentMethod = body.paymentMethod;
    bookingPatch.paymentMethod = nextPaymentMethod;
    methodChanged = booking.paymentMethod !== nextPaymentMethod;
  }

  // Cobro online posterior al hecho no se acepta por aquí — exigiría
  // crear sesión Stripe, QR y polling. El barbero debe usar el flow de
  // cobro normal. Aquí solo se reasignan métodos offline.
  if (nextPaymentMethod === 'card_online') {
    return Response.json(
      {
        error:
          'Para cambiar el cobro a online, reembolsa el pago actual y vuelve a cobrar online.',
      },
      { status: 400 },
    );
  }

  let tipDelete = false;
  let tipResolved: { amountCents: number; method: 'cash' | 'card'; barberId: string; barberName: string } | null = null;
  if ('tip' in body) {
    if (body.tip === null) {
      tipDelete = true;
    } else if (isTipPayload(body.tip)) {
      const [b] = await db
        .select({ id: barbers.id, name: barbers.name })
        .from(barbers)
        .where(
          and(
            eq(barbers.clientId, client.id),
            eq(barbers.id, body.tip.barberId),
            eq(barbers.active, true),
          ),
        );
      if (!b) {
        return Response.json(
          { error: 'Barbero de la propina no válido.' },
          { status: 400 },
        );
      }
      tipResolved = {
        amountCents: body.tip.amountCents,
        method: body.tip.method,
        barberId: b.id,
        barberName: b.name,
      };
    } else {
      return Response.json(
        { error: 'tip debe ser null o un objeto válido { amountCents, method, barberId }.' },
        { status: 400 },
      );
    }
  }

  const paymentNotes =
    typeof body.paymentNotes === 'string' ? body.paymentNotes.trim() : null;

  // Si no hay cambios materiales, devolvemos 400 — evita un round-trip
  // silencioso (mismo patrón que PATCH booking principal).
  const hasChanges =
    Object.keys(bookingPatch).length > 0 ||
    methodChanged ||
    priceChanged ||
    'tip' in body;
  if (!hasChanges) {
    return Response.json({ error: 'Nada que actualizar.' }, { status: 400 });
  }

  // ── 1. Aplicar patch al booking ────────────────────────────────────────
  if (Object.keys(bookingPatch).length > 0) {
    await db.update(bookings).set(bookingPatch).where(eq(bookings.id, bookingId));
  }

  // ── 2. Rebuild de payments si cambió precio o método ───────────────────
  // Política: re-escribimos la línea offline única. Los split-payments con
  // varios tramos NO se soportan en V1 — la UI fuerza método único. Si la
  // venta tenía múltiples tramos offline, los borramos todos y dejamos una
  // sola fila con el método pedido (o el primero existente si no se cambió).
  if (priceChanged || methodChanged) {
    const newTotalCents = await bookingTotalCents(bookingId);

    // Borrar los payments offline editables (sin proveedor externo + status
    // succeeded). Los de status cancelled/failed/refunded se conservan
    // como histórico — el filtro `externalLocked` arriba ya garantiza que
    // los succeeded NO tienen stripeChargeId/sumupTransactionId.
    const editableIds = allPayments
      .filter(
        (p) =>
          p.status === 'succeeded' &&
          !p.stripeChargeId &&
          !p.sumupTransactionId,
      )
      .map((p) => p.id);
    if (editableIds.length > 0) {
      // Drizzle no tiene `inArray` con array vacío bonito — usamos delete
      // uno a uno (lista corta, 1-2 filas típicamente).
      for (const id of editableIds) {
        await db.delete(payments).where(eq(payments.id, id));
      }
    }

    if (newTotalCents > 0) {
      const finalMethod =
        nextPaymentMethod ??
        (booking.paymentMethod && isPaymentMethod(booking.paymentMethod)
          ? booking.paymentMethod
          : 'cash');
      await db.insert(payments).values({
        clientId: client.id,
        bookingId,
        amountCents: newTotalCents,
        applicationFeeCents: 0,
        currency: 'eur',
        type: 'full',
        status: 'succeeded',
        method: finalMethod,
        paidAt: new Date(),
        recordedByEmail: user.email,
        notes: paymentNotes ?? 'Editado tras cobro',
        description: (bookingPatch.service ?? booking.service) as string,
      });

      // Asegurar que bookings.paymentMethod refleja el método final.
      if (!methodChanged) {
        await db
          .update(bookings)
          .set({ paymentMethod: finalMethod })
          .where(eq(bookings.id, bookingId));
      }
    }
  }

  // ── 3. Reescribir cash_movement del booking en la sesión abierta ───────
  // El cuadre se reconstruye SIEMPRE que algo del cobro cambie (precio o
  // método). Solo afecta a la sesión actualmente abierta — si la venta es
  // de una sesión ya cerrada, los movimientos antiguos NO se tocan
  // (snapshot inmutable del cierre); en su lugar el reajuste queda como
  // diferencia visible que el barbero verá al cuadrar próximamente.
  if (priceChanged || methodChanged) {
    const [openSession] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(
        and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)),
      );
    if (openSession && client.cashRegisterEnabled) {
      // Borrar los movements existentes del booking (kind='booking') en la
      // sesión abierta.
      await db
        .delete(cashMovements)
        .where(
          and(
            eq(cashMovements.clientId, client.id),
            eq(cashMovements.sessionId, openSession.id),
            eq(cashMovements.kind, 'booking'),
            eq(cashMovements.referenceType, 'booking'),
            eq(cashMovements.referenceId, bookingId),
          ),
        );

      const newTotalCents = await bookingTotalCents(bookingId);
      const finalMethod =
        nextPaymentMethod ??
        (booking.paymentMethod && isPaymentMethod(booking.paymentMethod)
          ? booking.paymentMethod
          : 'cash');
      if (newTotalCents > 0) {
        await db.insert(cashMovements).values({
          clientId: client.id,
          sessionId: openSession.id,
          kind: 'booking',
          method: CASH_MOVEMENT_METHOD_FROM_PAYMENT[finalMethod],
          amountCents: newTotalCents,
          referenceType: 'booking',
          referenceId: bookingId,
          createdByEmail: user.email,
          notes: 'Reajuste tras editar venta',
        });
      }
    }
  }

  // ── 4. Tip — upsert / delete ───────────────────────────────────────────
  if (tipDelete || tipResolved) {
    // Política: la propina se reescribe entera (1 fila por booking). Si hay
    // varias filas tips para este booking (raro: legacy), las borramos
    // todas y dejamos solo la nueva.
    const existingTips = await db
      .select({
        id: tips.id,
        stripeChargeId: tips.stripeChargeId,
        status: tips.status,
      })
      .from(tips)
      .where(and(eq(tips.bookingId, bookingId), eq(tips.clientId, client.id)));

    // Si alguna propina tiene cobro real con Stripe, abortar — igual que
    // payments, no se puede cambiar sin reembolso.
    const tipLocked = existingTips.find(
      (t) =>
        t.stripeChargeId &&
        t.status !== 'refunded' &&
        t.status !== 'cancelled' &&
        t.status !== 'failed',
    );
    if (tipLocked) {
      return Response.json(
        {
          error:
            'La propina actual fue cobrada vía Stripe. Reembolsa antes de cambiarla.',
          code: 'external_tip_locked',
        },
        { status: 409 },
      );
    }

    // Borrar tips previos + sus cash_movements asociados (kind='tip_cash'
    // + referenceType='booking' + referenceId=bookingId), solo en sesión
    // abierta (histórico cerrado no se toca).
    for (const t of existingTips) {
      await db.delete(tips).where(eq(tips.id, t.id));
    }

    const [openSession] = await db
      .select({ id: cashSessions.id })
      .from(cashSessions)
      .where(
        and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)),
      );
    if (openSession) {
      await db
        .delete(cashMovements)
        .where(
          and(
            eq(cashMovements.clientId, client.id),
            eq(cashMovements.sessionId, openSession.id),
            eq(cashMovements.kind, 'tip_cash'),
            eq(cashMovements.referenceType, 'booking'),
            eq(cashMovements.referenceId, bookingId),
          ),
        );
    }

    if (tipResolved) {
      const now = new Date();
      await db.insert(tips).values({
        clientId: client.id,
        bookingId,
        amountCents: tipResolved.amountCents,
        status: 'paid',
        paymentMethod: tipResolved.method,
        barberId: tipResolved.barberId,
        barberName: tipResolved.barberName,
        customerPhone: booking.customerPhone || '—',
        paidAt: now,
      });
      if (
        openSession &&
        tipResolved.method === 'cash' &&
        client.cashRegisterEnabled
      ) {
        await db.insert(cashMovements).values({
          clientId: client.id,
          sessionId: openSession.id,
          kind: 'tip_cash',
          method: 'cash',
          amountCents: tipResolved.amountCents,
          barberId: tipResolved.barberId,
          referenceType: 'booking',
          referenceId: bookingId,
          createdByEmail: user.email,
        });
      }
    }
  }

  const [updated] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  return Response.json({ booking: updated, ok: true });
}

// -----------------------------------------------------------------------------
// GET /api/bookings/[id]/sale — devuelve el estado actual de la venta
// (booking + payments succeeded + tip vigente + lock invoice) para precargar
// el modal de edición sin que el front tenga que hacer 3 fetches.
//
// Si la venta no es editable (booking != completed o invoice issued/rectified
// o payments con proveedor externo), devuelve `editable: false` + razón. La UI
// muestra el motivo y ofrece el flow alternativo (rectificativa o nada).
// -----------------------------------------------------------------------------
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireTenantActor(req);
  if (!access.ok) return tenantActorErrorResponse(access);
  const { client } = access;
  const { id: bookingId } = await params;

  const [booking] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)));
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada.' }, { status: 404 });
  }

  if (!access.isAdmin && access.barberId) {
    const canEditOthers = actorHasManagerPermission(access, 'edit_others_bookings');
    if (!canEditOthers && booking.barberId !== access.barberId) {
      return Response.json({ error: 'Esta cita no es tuya.' }, { status: 403 });
    }
  }

  const invoiceRows = await db
    .select({ id: invoices.id, status: invoices.status, number: invoices.number })
    .from(invoices)
    .where(
      and(eq(invoices.bookingId, bookingId), eq(invoices.clientId, client.id)),
    );
  const liveInvoice = invoiceRows.find(
    (r) => r.status === 'issued' || r.status === 'rectified',
  );

  const allPayments = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.bookingId, bookingId), eq(payments.clientId, client.id)),
    );
  const externalLocked = allPayments.some(
    (p) =>
      p.status !== 'cancelled' &&
      p.status !== 'failed' &&
      p.status !== 'refunded' &&
      (p.stripeChargeId || p.sumupTransactionId),
  );

  // Tip vigente — primero status='paid', luego cualquier reciente.
  const tipRows = await db
    .select()
    .from(tips)
    .where(and(eq(tips.bookingId, bookingId), eq(tips.clientId, client.id)));
  const currentTip = tipRows.find((t) => t.status === 'paid') ?? null;
  const tipExternalLocked = tipRows.some(
    (t) =>
      t.stripeChargeId &&
      t.status !== 'refunded' &&
      t.status !== 'cancelled' &&
      t.status !== 'failed',
  );

  // ¿Es editable por este endpoint? Si no, la UI debe rutear a rectificativa
  // o mostrar el motivo de bloqueo.
  let editable = true;
  let lockReason: string | null = null;
  if (booking.status !== 'completed') {
    editable = false;
    lockReason = 'booking_not_completed';
  } else if (booking.source === 'booksy') {
    editable = false;
    lockReason = 'booksy_readonly';
  } else if (liveInvoice) {
    editable = false;
    lockReason = 'invoice_locked';
  } else if (externalLocked || tipExternalLocked) {
    editable = false;
    lockReason = 'external_payment_locked';
  }

  // Resumen único de método/notes (V1: línea única editable).
  const succeededOffline = allPayments.filter(
    (p) =>
      p.status === 'succeeded' && !p.stripeChargeId && !p.sumupTransactionId,
  );

  return Response.json({
    editable,
    lockReason,
    invoice: liveInvoice
      ? { id: liveInvoice.id, number: liveInvoice.number, status: liveInvoice.status }
      : null,
    booking: {
      id: booking.id,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      service: booking.service,
      price: booking.price,
      paymentMethod: booking.paymentMethod,
      barberId: booking.barberId,
      barber: booking.barber,
    },
    payments: succeededOffline.map((p) => ({
      id: p.id,
      method: p.method,
      amountCents: p.amountCents,
      notes: p.notes,
    })),
    tip: currentTip
      ? {
          id: currentTip.id,
          amountCents: currentTip.amountCents,
          method: currentTip.paymentMethod,
          barberId: currentTip.barberId,
          barberName: currentTip.barberName,
        }
      : null,
  });
}
