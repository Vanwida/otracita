import { db } from '@/db'
import { bookings, products, productSales } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  requireClientAccess,
  accessErrorResponse,
} from '@/lib/auth/require-client-access'
import { createBooking } from '@/lib/bookings/create'
import { bookingTotalCents } from '@/lib/bookings/total'
import type { BookingServiceLine } from '@/lib/bookings/duration'
// La factura VeriFactu ya NO se emite al cobrar — es on-demand (POST
// /api/invoices/from-booking). Este endpoint solo registra la venta.
import { recordMovementInBackground } from '@/lib/cash/record-movement'
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup'
import { BUSINESS_TIMEZONE } from '@/lib/time';

// -----------------------------------------------------------------------------
// POST /api/pos/sale — venta de mostrador (TPV "Nueva venta", patrón Booksy).
//
// Cobra un WALK-IN SIN cita previa: el barbero arma un carrito (servicios +
// productos) y cobra en el sitio. NO inventa pipeline de cobro/factura: lo
// REUSA al 100%.
//
//   1. Crea UNA reserva sintética hoy/ahora vía `createBooking` (el mismo
//      pipeline único que usa bot/voice/dashboard/PWA). source = 'pos'.
//      El servicio principal del carrito va en bookings.service/price; los
//      demás servicios van como extraServices → booking_services (igual que
//      una cita multi-servicio normal).
//   2. La marca como `completed` con el método de pago elegido — replica
//      EXACTO lo que hace PATCH /api/bookings/[id] al cerrar una cita:
//      misma transición, misma auto-factura, mismo cash_movement, mismo
//      followup de reseña. No se duplica lógica fiscal ni de caja.
//   3. Inserta las ventas de PRODUCTO atadas a esa reserva (productSales con
//      bookingId) — la auto-factura de generateInvoiceFromBooking ya recoge
//      los productos pendientes del booking, así que entran en el mismo
//      ticket. Stock se decrementa atómicamente igual que /api/products/sales.
//
// Por qué una reserva y no un "ticket" nuevo: TODA la cadena fiscal
// (VeriFactu, invoice_items, idempotencia de productSales.invoicedAt) y de
// caja cuelga de un booking. Crear un concepto paralelo "venta suelta"
// duplicaría invoicing + cash + followup. Una reserva sintética de duración
// 0-min reusa los 4 sitios sin tocar schema. El walk-in sin cita es
// exactamente "una cita que ocurre ya": el modelo encaja.
//
// Multi-tenancy: requireClientAccess. NUNCA se acepta clientId del body.
// -----------------------------------------------------------------------------

interface ServiceLineIn {
  name: string
  priceEuros: number
  durationMin: number
}

interface ProductLineIn {
  productId: string
  quantity: number
}

interface Body {
  serviceLines?: unknown
  productLines?: unknown
  paymentMethod?: unknown
  barberId?: unknown
  customerPhone?: unknown
  customerName?: unknown
  /** SumUp Reader: crea la venta SIN cerrarla. El callback de SumUp la
   *  cierra (recordSumupCheckoutResult) tras el cobro real con datáfono —
   *  igual que la agenda. Devuelve {bookingId, amountCents} para que el
   *  prompt de checkout arranque contra esa reserva. */
  prepareForSumup?: unknown
}

const VALID_METHODS = ['cash', 'card', 'online'] as const
type PosMethod = (typeof VALID_METHODS)[number]

// Walk-in sin cita: no hay teléfono real. Usamos un marcador estable para
// que el customer-upsert de createBooking no agrupe a todos los walk-ins en
// una sola ficha de cliente fantasma — un teléfono sintético por venta.
function walkInPhone(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nowMadridParts(): { date: string; time: string } {
  const now = new Date()
  const date = now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE })
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return { date, time }
}

function parseServiceLines(input: unknown): ServiceLineIn[] {
  if (!Array.isArray(input)) return []
  const out: ServiceLineIn[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim() : ''
    const priceEuros =
      typeof r.priceEuros === 'number' && Number.isFinite(r.priceEuros) && r.priceEuros >= 0
        ? r.priceEuros
        : NaN
    const durationMin =
      typeof r.durationMin === 'number' && Number.isFinite(r.durationMin)
        ? Math.max(0, Math.trunc(r.durationMin))
        : 0
    if (!name || Number.isNaN(priceEuros)) continue
    out.push({ name, priceEuros, durationMin })
  }
  return out
}

function parseProductLines(input: unknown): ProductLineIn[] {
  if (!Array.isArray(input)) return []
  const out: ProductLineIn[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const productId = typeof r.productId === 'string' ? r.productId : ''
    const quantity =
      typeof r.quantity === 'number' && Number.isFinite(r.quantity)
        ? Math.trunc(r.quantity)
        : 0
    if (!productId || quantity < 1 || quantity > 99) continue
    out.push({ productId, quantity })
  }
  return out
}

export async function POST(req: Request) {
  const access = await requireClientAccess(req)
  if (!access.ok) return accessErrorResponse(access)
  const { client } = access

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const serviceLines = parseServiceLines(body.serviceLines)
  const productLines = parseProductLines(body.productLines)

  if (serviceLines.length === 0 && productLines.length === 0) {
    return Response.json(
      { error: 'El carrito está vacío.' },
      { status: 400 },
    )
  }

  const prepareForSumup = body.prepareForSumup === true

  // En modo SumUp el método lo fija el callback ('card'); el body puede no
  // traerlo. En modo normal exigimos un método válido.
  const paymentMethod =
    typeof body.paymentMethod === 'string' &&
    (VALID_METHODS as readonly string[]).includes(body.paymentMethod)
      ? (body.paymentMethod as PosMethod)
      : null
  if (!prepareForSumup && !paymentMethod) {
    return Response.json({ error: 'Método de pago inválido.' }, { status: 400 })
  }
  // Para los INSERT de productSales necesitamos un método concreto aunque
  // en SumUp el cierre lo haga el callback — usamos 'card' (lo que SumUp
  // registra) para que el cuadre y la factura sean coherentes.
  const effectiveMethod: PosMethod = paymentMethod ?? 'card'

  const barberId =
    typeof body.barberId === 'string' && body.barberId.length > 0
      ? body.barberId
      : undefined
  const customerName =
    typeof body.customerName === 'string' && body.customerName.trim().length > 0
      ? body.customerName.trim()
      : null
  const customerPhone =
    typeof body.customerPhone === 'string' && body.customerPhone.trim().length > 0
      ? body.customerPhone.trim()
      : walkInPhone()

  // ── 1. Verificar productos (pertenencia + activos) antes de crear nada ──
  const productById = new Map<
    string,
    { id: string; priceCents: number; stockQuantity: number | null }
  >()
  if (productLines.length > 0) {
    const ids = [...new Set(productLines.map((p) => p.productId))]
    const rows = await db
      .select({
        id: products.id,
        priceCents: products.priceCents,
        stockQuantity: products.stockQuantity,
      })
      .from(products)
      .where(
        and(
          eq(products.clientId, client.id),
          eq(products.active, true),
          sql`${products.id} IN ${ids}`,
        ),
      )
    for (const r of rows) productById.set(r.id, r)
    for (const line of productLines) {
      if (!productById.has(line.productId)) {
        return Response.json(
          { error: 'Algún producto del carrito ya no existe.' },
          { status: 404 },
        )
      }
    }
  }

  // ── 2. Reserva sintética vía el pipeline ÚNICO de creación ─────────────
  // El primer servicio del carrito es el "principal". Si el carrito es solo
  // productos, usamos una línea de servicio cero ("Venta de productos") para
  // que la reserva exista y la factura cuelgue de ella — bookings.service es
  // NOT NULL.
  const { date, time } = nowMadridParts()

  const primary = serviceLines[0] ?? {
    name: 'Venta de productos',
    priceEuros: 0,
    durationMin: 0,
  }
  const extras: BookingServiceLine[] = serviceLines.slice(1).map((s) => ({
    name: s.name,
    durationMin: s.durationMin,
    priceEuros: s.priceEuros,
  }))

  const created = await createBooking({
    client,
    customerPhone,
    customerName,
    service: primary.name,
    barberId,
    date,
    time,
    // Duración mínima 1: createBooking exige > 0. Una venta de mostrador no
    // bloquea agenda de verdad — es instantánea — pero el snapshot necesita
    // un valor válido.
    duration: Math.max(1, primary.durationMin || 1),
    price: primary.priceEuros,
    extraServices: extras.length > 0 ? extras : undefined,
    source: 'pos',
  })

  if (!created.success) {
    // El único error esperable en una venta de mostrador es "no hay
    // barberos configurados". El resto (overlap/lead/horizon) no aplica a
    // un walk-in de ahora mismo, pero devolvemos el mensaje tal cual.
    const status = created.error === 'overlap' ? 409 : 422
    return Response.json({ error: created.message }, { status })
  }

  const booking = created.booking

  // ── 3. Ventas de producto atadas a la reserva ──────────────────────────
  // Mismo INSERT + decremento atómico de stock que /api/products/sales. Se
  // atan al booking → generateInvoiceFromBooking las mete en el MISMO ticket
  // y el cash_movement de cada una alimenta el cuadre. No duplicamos su
  // lógica fiscal: solo persistimos las filas con bookingId.
  const productSaleIds: string[] = []
  for (const line of productLines) {
    const prod = productById.get(line.productId)!
    if (prod.stockQuantity !== null) {
      const decremented = await db
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, prod.id),
            eq(products.clientId, client.id),
            sql`${products.stockQuantity} >= ${line.quantity}`,
          ),
        )
        .returning({ id: products.id })
      if (decremented.length === 0) {
        // Stock se agotó entre la verificación y aquí. La reserva ya está
        // creada; devolvemos error parcial claro en vez de cobrar de más.
        return Response.json(
          {
            error: 'Stock insuficiente de un producto. Revisa el carrito.',
            bookingId: booking.id,
          },
          { status: 409 },
        )
      }
    }
    const [sale] = await db
      .insert(productSales)
      .values({
        clientId: client.id,
        productId: prod.id,
        bookingId: booking.id,
        barberId: booking.barberId ?? null,
        quantity: line.quantity,
        unitPriceCents: prod.priceCents,
        totalCents: prod.priceCents * line.quantity,
        customerPhone: booking.customerPhone,
        paymentMethod: effectiveMethod,
      })
      .returning({ id: productSales.id })
    if (sale) productSaleIds.push(sale.id)
  }

  // Total cobrado (servicio + extras + productos), IVA incluido — para el
  // recibo y para arrancar el checkout SumUp con el importe correcto.
  const servicesTotalCents = serviceLines.reduce(
    (acc, s) => acc + Math.round(s.priceEuros * 100),
    0,
  )
  const productsTotalCents = productLines.reduce((acc, line) => {
    const prod = productById.get(line.productId)
    return acc + (prod ? prod.priceCents * line.quantity : 0)
  }, 0)
  const grandTotalCents = servicesTotalCents + productsTotalCents

  // ── SumUp Reader: NO cerramos aquí ─────────────────────────────────────
  // La reserva queda 'confirmed' con sus productSales atados. El front abre
  // SumupCheckoutPrompt contra este bookingId; cuando el datáfono cobra,
  // el callback /api/sumup/checkout/return → recordSumupCheckoutResult
  // cierra el booking (status=completed, paymentMethod='card'), dispara
  // auto-factura + followup + cash_movement. Idéntico a la agenda — cero
  // duplicación de cierre.
  if (prepareForSumup) {
    return Response.json(
      {
        bookingId: booking.id,
        amountCents: grandTotalCents,
        prepared: true,
      },
      { status: 201 },
    )
  }

  // ── 4. Cerrar la reserva = cobrar. Replica EXACTO el cierre del PATCH ──
  // Misma transición confirmed→completed, mismo paymentMethod persistido,
  // misma auto-factura, mismo cash_movement del servicio, mismo followup.
  // (Ver bloque equivalente en src/app/api/bookings/[id]/route.ts.)
  const recordServicePayment = client.cashRegisterEnabled
  await db
    .update(bookings)
    .set({
      status: 'completed',
      paymentMethod: recordServicePayment ? effectiveMethod : null,
    })
    .where(eq(bookings.id, booking.id))

  const [updated] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, booking.id))

  // Facturación VeriFactu: NUNCA automática. La venta queda como TICKET
  // interno (registrada para caja/ingresos/BI igual que antes); declararla
  // a Hacienda es una acción explícita del barbero en el recibo post-pago
  // (POST /api/invoices/from-booking). Patrón Booksy: venta → recibo,
  // "Generar factura" aparte.

  if (updated && client.ratingsEnabled) {
    tryRatingFollowupForCompletedBooking(updated.id)
  }

  // Cash movement del SERVICIO (los de productos los emite recordMovement
  // abajo). Suma principal + servicios EXTRA (R7) vía bookingTotalCents —
  // si la cita es simple es idéntico al price*100 de antes.
  if (recordServicePayment && updated) {
    const serviceTotalCents = await bookingTotalCents(updated.id)
    if (serviceTotalCents > 0) {
      recordMovementInBackground({
        clientId: client.id,
        referenceType: 'booking',
        referenceId: updated.id,
        method: effectiveMethod,
        amountCents: serviceTotalCents,
        createdByEmail: access.user.email,
      })
    }
  }

  // Cash movement por cada venta de producto — igual que /api/products/sales.
  if (recordServicePayment) {
    for (let i = 0; i < productLines.length; i++) {
      const line = productLines[i]
      const prod = productById.get(line.productId)
      const saleId = productSaleIds[i]
      if (!prod || !saleId) continue
      recordMovementInBackground({
        clientId: client.id,
        referenceType: 'product_sale',
        referenceId: saleId,
        method: effectiveMethod,
        amountCents: prod.priceCents * line.quantity,
        createdByEmail: access.user.email,
      })
    }
  }

  return Response.json(
    {
      bookingId: booking.id,
      paymentMethod: effectiveMethod,
      totalCents: grandTotalCents,
    },
    { status: 201 },
  )
}
