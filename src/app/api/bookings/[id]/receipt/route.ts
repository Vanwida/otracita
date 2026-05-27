import { db } from '@/db'
import {
  bookings,
  customers,
  payments,
  invoices,
  tips,
  clients,
} from '@/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'

// -----------------------------------------------------------------------------
// GET /api/bookings/[id]/receipt
//
// Endpoint canónico que alimenta la pantalla "Cobrado" tras finalizar un
// cobro (task #103). Devuelve TODO lo necesario para pintar el recibo en una
// sola llamada — el ChargedReceiptStep no debería hacer 4 fetches en cadena
// (lat. acumulada y race conditions con el `paidAt` recién insertado).
//
// Multi-tenant safe: `requireClientAccess` + filtro por clientId del booking
// (que ya se valida contra el cliente autenticado en el guard).
//
// Shape devuelto:
//   {
//     booking: { id, customerName, customerPhone, service, priceEuros,
//                paymentMethod, startsAt, endsAt, barberName },
//     customer: { id, email } | null,    // null = walk-in sin row en customers
//     invoice:  { id, number, subtotalCents, ivaRate, ivaAmountCents,
//                 totalCents, issueDate } | null,
//     payments: [{ method, amountCents, paidAt, notes }],  // un row por tramo
//     tip:      { amountCents, method, barberName } | null,
//     client:   { businessName, address, ivaRate }
//   }
//
// Razonamiento de qué se incluye:
//   · customer.email + customer.phone → para activar/desactivar botones de
//     "Enviar por email" y "WhatsApp" sin segundo round-trip.
//   · invoice (si existe) → número de factura + base imponible para el
//     bloque colapsable "Ver desglose IVA". Si no hay invoice (Solo plan,
//     booking sin emitir), fallback al booking.price.
//   · payments[] → método(s) de cobro real(es). El "mixed" se infiere si
//     hay >1 row con method distinto. El input de cambio sólo aplica si
//     algún row tiene method='cash'.
//   · tip → para coronar la pantalla con "+ propina X,XX €" si la hubo.
//
// No requiere `requireTenantActor` (action de lectura, sin escritura) — el
// guard simple por cliente es suficiente y consistente con
// /api/payments/by-booking y /api/invoices/by-booking.
// -----------------------------------------------------------------------------

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)

  const { client, isAdmin } = access
  const { id: bookingId } = await params

  if (!bookingId) {
    return Response.json({ error: 'Falta id de reserva' }, { status: 400 })
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
  if (!booking) {
    return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
  }
  if (!isAdmin && booking.clientId !== client.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Tenant config (businessName, ivaRate, address) ─────────────────────
  const [tenant] = await db
    .select({
      businessName: clients.businessName,
      address: clients.address,
      ivaRate: clients.ivaRate,
    })
    .from(clients)
    .where(eq(clients.id, booking.clientId))

  // ── Customer (puede ser null si el booking fue manual sin row) ────────
  const [customer] = await db
    .select({
      id: customers.id,
      email: customers.email,
      phone: customers.phone,
    })
    .from(customers)
    .where(
      and(
        eq(customers.clientId, booking.clientId),
        eq(customers.phone, booking.customerPhone),
      ),
    )

  // ── Invoice vigente (si VeriFactu emitió) ─────────────────────────────
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        eq(invoices.clientId, booking.clientId),
      ),
    )
    .orderBy(desc(invoices.createdAt))
  const issued = invoiceRows.find((r) => r.status === 'issued')
  const latestInvoice = issued ?? invoiceRows[0] ?? null

  // ── Payments succeeded — uno por tramo del cobro ───────────────────────
  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, bookingId),
        eq(payments.clientId, booking.clientId),
      ),
    )
    .orderBy(desc(payments.createdAt))

  const succeededPayments = paymentRows.filter((p) => p.status === 'succeeded')

  // ── Tip vigente ────────────────────────────────────────────────────────
  const tipRows = await db
    .select()
    .from(tips)
    .where(
      and(
        eq(tips.bookingId, bookingId),
        eq(tips.clientId, booking.clientId),
      ),
    )
  const currentTip = tipRows.find((t) => t.status === 'paid') ?? null

  // ── Compose start/end ISO con date + time ──────────────────────────────
  // bookings guarda date YYYY-MM-DD + time HH:MM separados; devolvemos el
  // ISO unido para que el frontend lo formatee con su locale sin reinventar.
  const startsAt = `${booking.date}T${booking.time}:00`

  return Response.json({
    booking: {
      id: booking.id,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      service: booking.service,
      // EUROS (foot-gun) — el front lo multiplica ×100 cuando lo cruza con
      // los céntimos de invoice/payments. Lo mantenemos como llega de la BD
      // para no introducir conversiones implícitas aquí.
      priceEuros: booking.price,
      paymentMethod: booking.paymentMethod,
      startsAt,
      durationMin: booking.duration,
      barberName: booking.barber,
    },
    customer: customer ?? null,
    invoice: latestInvoice
      ? {
          id: latestInvoice.id,
          number: latestInvoice.number,
          subtotalCents: latestInvoice.subtotalCents,
          ivaRate: latestInvoice.ivaRate,
          ivaAmountCents: latestInvoice.ivaAmountCents,
          totalCents: latestInvoice.totalCents,
          issueDate: latestInvoice.issueDate,
        }
      : null,
    payments: succeededPayments.map((p) => ({
      id: p.id,
      method: p.method,
      amountCents: p.amountCents,
      paidAt: p.paidAt,
      notes: p.notes,
    })),
    tip: currentTip
      ? {
          amountCents: currentTip.amountCents,
          method: currentTip.paymentMethod,
          barberName: currentTip.barberName,
        }
      : null,
    client: {
      businessName: tenant?.businessName ?? '',
      address: tenant?.address ?? null,
      ivaRate: tenant?.ivaRate ?? 21,
    },
  })
}
