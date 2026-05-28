import { db } from '@/db'
import { barbers, bookings, invoices, products, productSales } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  requireTenantActor,
  tenantActorErrorResponse,
  actorHasManagerPermission,
} from '@/lib/auth/require-tenant-actor'
import { recordMovementInBackground } from '@/lib/cash/record-movement'

// -----------------------------------------------------------------------------
// POST /api/products/sales — registra una venta de producto o un consumo
// interno / merma.
//
// Body:
//   {
//     productId: string,
//     quantity: number (>= 1),
//     paymentMethod: 'cash' | 'card' | 'online',  // requerido si venta
//     bookingId?: string,                          // si está asociada a cita
//     barberId?: string,                           // atribución per-barbero
//     customerPhone?: string,                      // auto-fill si bookingId
//     consumptionKind?: 'internal' | 'damage' | null,  // tipo de salida
//   }
//
// Lógica:
//   1. Multi-tenancy: requireClientAccess + product.client_id check.
//   2. Si bookingId presente, verificar que el booking pertenece al cliente
//      y auto-fill customerPhone + barberId desde el booking si no vinieron.
//   3. Si product.stock_quantity != null, decrementar atómicamente con
//      UPDATE ... WHERE stock_quantity >= quantity. Si afectó 0 filas →
//      stock insuficiente.
//   4. INSERT en product_sales con snapshot del unit_price_cents y total
//      (y consumption_kind si aplica).
//   5. Si NO es consumo interno/merma → crear cash_movement como antes.
//      Si SÍ es consumo → SKIP movement (no hay flujo de dinero).
//   6. Devolver la sale para que el caller actualice UI.
//
// Sin transacción explícita porque las dos operaciones (UPDATE stock +
// INSERT sale) son independientes — si falla el INSERT después del UPDATE
// queda un decremento huérfano. Para MVP es aceptable; revisar si crece.
// -----------------------------------------------------------------------------

interface Body {
  productId?: unknown
  quantity?: unknown
  paymentMethod?: unknown
  bookingId?: unknown
  barberId?: unknown
  customerPhone?: unknown
  consumptionKind?: unknown
  /**
   * Override del precio unitario en céntimos (task #111). El editor de venta
   * cobrada deja al barbero corregir el importe del producto que vendió (p.ej.
   * un descuento aplicado a mano). Si no viene, se usa el precio del catálogo.
   */
  unitPriceCents?: unknown
}

const VALID_METHODS = ['cash', 'card', 'online']
const VALID_CONSUMPTION_KINDS = ['internal', 'damage'] as const
type ConsumptionKind = (typeof VALID_CONSUMPTION_KINDS)[number]

export async function POST(req: Request) {
  // Admin + role='barber'. Las ventas de producto desde la agenda /yo/
  // necesitan que el barbero pueda registrar — el endpoint atribuye al
  // barberId por defecto (ver fallback abajo).
  const access = await requireTenantActor(req)
  if (!access.ok) return tenantActorErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const productId = typeof body.productId === 'string' ? body.productId : ''
  if (!productId) return Response.json({ error: 'productId requerido' }, { status: 400 })

  const quantity = typeof body.quantity === 'number' ? body.quantity : Number.parseInt(String(body.quantity ?? ''), 10)
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
    return Response.json({ error: 'Cantidad inválida (1-99)' }, { status: 400 })
  }

  // Override de precio unitario (task #111). Solo lo aceptamos para ventas a
  // cliente (no para consumo interno / merma — esos no tienen precio de venta).
  // Rango: 0..100k € en céntimos. null/ausente = precio del catálogo.
  let unitPriceOverrideCents: number | null = null
  if (body.unitPriceCents !== undefined && body.unitPriceCents !== null) {
    const raw =
      typeof body.unitPriceCents === 'number'
        ? body.unitPriceCents
        : Number.parseInt(String(body.unitPriceCents), 10)
    if (!Number.isFinite(raw) || raw < 0 || raw > 100_000_00) {
      return Response.json({ error: 'Precio inválido.' }, { status: 400 })
    }
    unitPriceOverrideCents = Math.round(raw)
  }

  // consumptionKind: whitelist. Si viene, la venta no mueve dinero (sin
  // cash_movement, sin paymentMethod efectivo) — sólo decrementa stock.
  let consumptionKind: ConsumptionKind | null = null
  if (body.consumptionKind !== undefined && body.consumptionKind !== null) {
    if (
      typeof body.consumptionKind !== 'string' ||
      !VALID_CONSUMPTION_KINDS.includes(body.consumptionKind as ConsumptionKind)
    ) {
      return Response.json({ error: 'Tipo de consumo inválido' }, { status: 400 })
    }
    consumptionKind = body.consumptionKind as ConsumptionKind
  }

  // paymentMethod: requerido para ventas normales. Para consumo interno /
  // merma no hay flujo de dinero, pero la columna es NOT NULL en DB →
  // guardamos 'cash' como placeholder (nunca llega a caja porque skip
  // cash_movement, y los queries de revenue filtrarán consumption_kind).
  const paymentMethodRaw = typeof body.paymentMethod === 'string' ? body.paymentMethod : ''
  let paymentMethod: string
  if (consumptionKind) {
    paymentMethod = VALID_METHODS.includes(paymentMethodRaw) ? paymentMethodRaw : 'cash'
  } else {
    if (!VALID_METHODS.includes(paymentMethodRaw)) {
      return Response.json({ error: 'Método de pago inválido' }, { status: 400 })
    }
    paymentMethod = paymentMethodRaw
  }

  const bookingId = typeof body.bookingId === 'string' && body.bookingId.length > 0 ? body.bookingId : null
  let barberId = typeof body.barberId === 'string' && body.barberId.length > 0 ? body.barberId : null
  let customerPhone = typeof body.customerPhone === 'string' && body.customerPhone.length > 0 ? body.customerPhone : null

  // Multi-tenancy del barberId (#89): si viene en el body, debe pertenecer
  // al client autenticado. Sin esta validación un admin podría inyectar
  // un barberId de otro tenant y la atribución de gasto se cruzaría.
  // (`requireTenantActor` ya restringe a barber-role que el barberId sea
  // el suyo en líneas 142-148, pero el caso admin / owner sin barber-role
  // queda abierto sin esta verificación explícita.)
  if (barberId) {
    const [b] = await db
      .select({ id: barbers.id })
      .from(barbers)
      .where(and(eq(barbers.id, barberId), eq(barbers.clientId, client.id)))
    if (!b) {
      return Response.json({ error: 'Barbero no válido para este negocio.' }, { status: 400 })
    }
  }

  // Verificar que el producto pertenece al cliente y está activo.
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.clientId, client.id), eq(products.active, true)))
  if (!product) return Response.json({ error: 'Producto no encontrado' }, { status: 404 })

  // Si bookingId, validar pertenencia y auto-fill datos faltantes.
  if (bookingId) {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.clientId, client.id)))
    if (!booking) return Response.json({ error: 'Reserva no encontrada' }, { status: 404 })
    // Ownership: barber operator solo añade ventas a SUS propias citas.
    if (!access.isAdmin && access.barberId) {
      const canEditOthers = actorHasManagerPermission(access, 'edit_others_bookings')
      if (!canEditOthers && booking.barberId !== access.barberId) {
        return Response.json({ error: 'Esta cita no es tuya.' }, { status: 403 })
      }
    }
    if (!barberId && booking.barberId) barberId = booking.barberId
    if (!customerPhone && booking.customerPhone) customerPhone = booking.customerPhone

    // VeriFactu (task #111): a una venta YA COBRADA solo se le pueden añadir
    // productos mientras NO exista factura emitida — igual tratamiento que el
    // editor de venta #86 da al resto de campos. Si hay invoice issued/rectified
    // la corrección exige una rectificativa, no un INSERT silencioso.
    //
    // Durante `confirmed` no hay documento fiscal todavía, así que el flujo de
    // venta normal (corte en curso) no se ve afectado: este guard solo aplica a
    // bookings ya `completed`. Defense-in-depth — la UI ya solo abre el flujo de
    // "añadir producto a venta cerrada" cuando el GET /sale devolvió editable.
    if (booking.status === 'completed') {
      const invoiceRows = await db
        .select({ status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.bookingId, bookingId), eq(invoices.clientId, client.id)))
      const hasLiveInvoice = invoiceRows.some(
        (r) => r.status === 'issued' || r.status === 'rectified',
      )
      if (hasLiveInvoice) {
        return Response.json(
          {
            error:
              'Esta venta tiene factura emitida. Para añadir productos emite una rectificativa.',
            code: 'invoice_locked',
          },
          { status: 409 },
        )
      }
    }
  }

  // Si NO hay bookingId Y el actor es barber-role sin barberId del body,
  // atribuir la venta walk-in al actor. Operator puro: forzamos su barberId
  // (no puede inventar otro). Manager con `edit_others_bookings`: respetamos
  // lo que mande el body (puede atribuir a cualquier compañero).
  if (!bookingId && !access.isAdmin && access.barberId) {
    const canEditOthers = actorHasManagerPermission(access, 'edit_others_bookings')
    if (!canEditOthers) {
      barberId = access.barberId
    } else if (!barberId) {
      barberId = access.barberId
    }
  }

  // Consumo interno (#89): el barbero atribuido es obligatorio porque el
  // sentido del registro es "quién gastó" — sin barberId no hay control de
  // gasto ni base para futuras comisiones. La merma (`damage`) sigue sin
  // exigirlo: es un gasto del local, no de un barbero.
  if (consumptionKind === 'internal' && !barberId) {
    return Response.json(
      { error: 'Indica qué barbero usó el producto.' },
      { status: 400 },
    )
  }

  // Stock atómico: si el producto trackea stock, decrementar con condición.
  if (product.stockQuantity !== null) {
    const decremented = await db
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} - ${quantity}`, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, productId),
          eq(products.clientId, client.id),
          sql`${products.stockQuantity} >= ${quantity}`,
        ),
      )
      .returning({ id: products.id, stockQuantity: products.stockQuantity })

    if (decremented.length === 0) {
      return Response.json({ error: 'Stock insuficiente' }, { status: 409 })
    }
  }

  // Override solo para ventas a cliente. En consumo interno / merma el precio
  // de venta no aplica (el P&L usa cost_price), así que ignoramos el override.
  const unitPriceCents =
    unitPriceOverrideCents !== null && !consumptionKind
      ? unitPriceOverrideCents
      : product.priceCents
  const totalCents = unitPriceCents * quantity

  const [sale] = await db
    .insert(productSales)
    .values({
      clientId: client.id,
      productId,
      bookingId,
      barberId,
      quantity,
      unitPriceCents,
      totalCents,
      customerPhone,
      paymentMethod,
      consumptionKind,
    })
    .returning()

  // Cash movement enlazado a la venta. No-op si el tenant no tiene
  // cashRegisterEnabled o si no hay sesión activa — la venta queda
  // registrada igual en product_sales.payment_method para histórico.
  //
  // Si es consumo interno o merma → SKIP: no hay flujo de dinero que
  // registrar en caja.
  if (client.cashRegisterEnabled && !consumptionKind) {
    recordMovementInBackground({
      clientId: client.id,
      referenceType: 'product_sale',
      referenceId: sale.id,
      method: paymentMethod as 'cash' | 'card' | 'online',
      amountCents: totalCents,
      createdByEmail: access.user.email,
    })
  }

  return Response.json({ sale }, { status: 201 })
}
