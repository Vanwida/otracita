import { db } from '@/db'
import {
  bookings,
  cashMovements,
  cashSessions,
  invoices,
  products,
  productSales,
} from '@/db/schema'
import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
} from '@/lib/auth/require-tenant-actor'

// -----------------------------------------------------------------------------
// DELETE /api/products/sales/[id] — quita una venta de producto registrada por
// error (task #111). Pensado para el editor de "venta cobrada": el barbero
// añade un champú que vendió y, si se equivocó, lo elimina.
//
// Efectos (secuenciales — neon-http no soporta transacción, mismo patrón que
// /api/bookings/[id]/sale):
//   1. Multi-tenancy: requireTenantActor + sale.clientId == client.id.
//   2. Ownership: si la venta cuelga de un booking ajeno y el actor es barber
//      sin `edit_others_bookings` → 403.
//   3. Bloqueo VeriFactu: si la venta ya está facturada (productSales.invoicedAt
//      != null) o el booking tiene factura viva → 409. Una venta sellada se
//      corrige con rectificativa, no se borra. Mismo tratamiento que el #86.
//      Tampoco se permite borrar consumos internos / merma desde aquí (este
//      endpoint es solo para la venta a cliente desde el editor de la cita).
//   4. Devolver stock: products.stock_quantity += quantity (solo si trackea
//      stock). Inverso exacto del decremento del POST.
//   5. Borrar el cash_movement enlazado (kind='product_sale',
//      referenceId=sale.id) SOLO en la sesión de caja abierta — el histórico de
//      sesiones cerradas es inmutable (mismo criterio que el editor de venta).
//   6. Borrar la fila product_sales.
// -----------------------------------------------------------------------------

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { client } = access
  const { id: saleId } = await params

  // ── Cargar venta + tenant ──────────────────────────────────────────────
  const [sale] = await db
    .select()
    .from(productSales)
    .where(and(eq(productSales.id, saleId), eq(productSales.clientId, client.id)))
  if (!sale) {
    return Response.json({ error: 'Venta no encontrada.' }, { status: 404 })
  }

  // Este endpoint solo gestiona ventas a cliente. Consumo interno / merma se
  // ajustan desde /dashboard/ventas/productos (otra trazabilidad).
  if (sale.consumptionKind) {
    return Response.json(
      { error: 'Los consumos internos y mermas se ajustan desde Productos.' },
      { status: 409 },
    )
  }

  // ── Ownership sobre el booking asociado ────────────────────────────────
  if (sale.bookingId) {
    const [booking] = await db
      .select({ id: bookings.id, barberId: bookings.barberId, clientId: bookings.clientId })
      .from(bookings)
      .where(and(eq(bookings.id, sale.bookingId), eq(bookings.clientId, client.id)))
    if (booking && !access.isAdmin && access.barberId) {
      const canEditOthers = actorHasManagerPermission(access, 'edit_others_bookings')
      if (!canEditOthers && booking.barberId !== access.barberId) {
        return Response.json({ error: 'Esta cita no es tuya.' }, { status: 403 })
      }
    }
  }

  // ── Bloqueo fiscal ──────────────────────────────────────────────────────
  // La propia venta ya facturada (estampada al emitir) no se borra.
  if (sale.invoicedAt) {
    return Response.json(
      {
        error:
          'Esta venta ya está en una factura emitida. Para quitarla emite una rectificativa.',
        code: 'invoice_locked',
      },
      { status: 409 },
    )
  }
  // …y por si el booking tiene factura viva pero la venta aún no se selló
  // (carrera): bloqueamos igual.
  if (sale.bookingId) {
    const invoiceRows = await db
      .select({ status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.bookingId, sale.bookingId), eq(invoices.clientId, client.id)))
    const hasLiveInvoice = invoiceRows.some(
      (r) => r.status === 'issued' || r.status === 'rectified',
    )
    if (hasLiveInvoice) {
      return Response.json(
        {
          error:
            'Esta venta tiene factura emitida. Para quitar productos emite una rectificativa.',
          code: 'invoice_locked',
        },
        { status: 409 },
      )
    }
  }

  // ── 1. Devolver stock (inverso del decremento atómico del POST) ────────
  // Solo si el producto trackea stock. Si el producto se borró duro (raro,
  // el flow es soft-delete) el UPDATE no afecta filas y la venta se borra
  // igual — no bloqueamos por un producto inexistente.
  if (sale.quantity > 0) {
    await db
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} + ${sale.quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, sale.productId),
          eq(products.clientId, client.id),
          sql`${products.stockQuantity} IS NOT NULL`,
        ),
      )
  }

  // ── 2. Borrar el cash_movement enlazado en la sesión abierta ───────────
  const [openSession] = await db
    .select({ id: cashSessions.id })
    .from(cashSessions)
    .where(and(eq(cashSessions.clientId, client.id), isNull(cashSessions.closedAt)))
  if (openSession) {
    await db
      .delete(cashMovements)
      .where(
        and(
          eq(cashMovements.clientId, client.id),
          eq(cashMovements.sessionId, openSession.id),
          eq(cashMovements.kind, 'product_sale'),
          eq(cashMovements.referenceType, 'product_sale'),
          eq(cashMovements.referenceId, saleId),
        ),
      )
  }

  // ── 3. Borrar la venta ──────────────────────────────────────────────────
  await db.delete(productSales).where(eq(productSales.id, saleId))

  return Response.json({ ok: true })
}
