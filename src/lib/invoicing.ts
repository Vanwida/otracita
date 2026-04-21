import { db } from '@/db';
import { clients, bookings, invoices } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Invoicing helper — tickets/facturas the barbershop emits to its own
// customers. This is the feature we ship to compete with Booksy: automatic
// fiscal docs on every confirmed booking with a price.
//
// Convention: in Spain the "price" on a service already includes IVA (retail
// all-in pricing), so we reverse-calculate the base imponible. All numbers
// stored in integer cents to avoid float drift — UI formats to euros.
// -----------------------------------------------------------------------------

/** Width to zero-pad the sequential number to. 4 => "0001", "0042", "1337". */
const INVOICE_NUMBER_PAD = 4;

/** A ticket simplificado (B2C) when the customer has no NIF, else a factura (B2B). */
export type InvoiceType = 'ticket' | 'invoice';

/**
 * Build an invoice number from the client's configured prefix and the next
 * sequence counter. Pure — caller decides when/how to increment the counter.
 *
 *  prefix="FAC-2026-", next=7  => "FAC-2026-0007"
 *  prefix="",          next=7  => "0007"
 */
export function generateInvoiceNumber(input: {
  invoiceNumberPrefix: string;
  invoiceNumberNext: number;
}): string {
  const padded = String(input.invoiceNumberNext).padStart(INVOICE_NUMBER_PAD, '0');
  return `${input.invoiceNumberPrefix ?? ''}${padded}`;
}

export interface InvoiceAmounts {
  subtotalCents: number;
  ivaAmountCents: number;
  totalCents: number;
}

/**
 * Given a price in EUROS (as stored on `bookings.price`) and an IVA rate
 * percentage, return the Spanish breakdown in CENTS. The input price is
 * interpreted as VAT-inclusive (the retail convention).
 *
 * Math:
 *   total    = round(price * 100)
 *   subtotal = round(total / (1 + iva/100))
 *   ivaAmt   = total - subtotal     // absorbs rounding so total is exact
 */
export function calculateAmounts(
  priceInEuros: number,
  ivaRate: number,
): InvoiceAmounts {
  const totalCents = Math.round(priceInEuros * 100);
  const subtotalCents = Math.round(totalCents / (1 + ivaRate / 100));
  const ivaAmountCents = totalCents - subtotalCents;
  return { subtotalCents, ivaAmountCents, totalCents };
}

/** Ticket if no NIF provided, factura when we have a fiscal identifier. */
export function determineInvoiceType(customerNif: string | null | undefined): InvoiceType {
  return customerNif && customerNif.trim().length > 0 ? 'invoice' : 'ticket';
}

/**
 * Very light Spanish NIF/CIF shape check — 8 chars, starts with digit or
 * letter, middle 7 digits, ends with digit or letter. Intentionally lenient:
 * we warn, we don't block. Real checksum validation is out of scope for MVP.
 */
const NIF_SHAPE = /^[0-9A-Z][0-9]{7}[0-9A-Z]$/i;
export function looksLikeValidNif(value: string): boolean {
  return NIF_SHAPE.test(value.trim());
}

type BookingRow = typeof bookings.$inferSelect;

export interface GenerateInvoiceResult {
  invoiceId: string;
  number: string;
  alreadyExisted: boolean;
}

/**
 * Generate (or fetch existing) invoice row from a booking id.
 *
 * Safe to call multiple times — idempotent on (clientId, bookingId): if a
 * row already exists for the booking, returns it.
 *
 * Atomically increments `clients.invoice_number_next` so concurrent calls
 * never collide on the generated number (the UNIQUE constraint on
 * (clientId, number) is the ultimate guard).
 *
 * Returns null if the booking does not exist, has no price, or the client
 * has invoicing disabled. Callers should treat null as "no-op, skip silently".
 */
export async function generateInvoiceFromBooking(
  bookingId: string,
): Promise<GenerateInvoiceResult | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return null;
  if (booking.price == null) return null;
  if (booking.status === 'cancelled') return null;

  // Idempotency: does an invoice already exist for this booking?
  const [existing] = await db
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .where(eq(invoices.bookingId, bookingId));
  if (existing) {
    return { invoiceId: existing.id, number: existing.number, alreadyExisted: true };
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, booking.clientId));
  if (!client) return null;
  if (!client.invoicingEnabled) return null;

  // Atomically reserve the next number. `UPDATE ... RETURNING` on the client
  // row guarantees we get a unique sequence value per call, even under
  // concurrent generation (two parallel webhooks cannot get the same next).
  const [reserved] = await db
    .update(clients)
    .set({ invoiceNumberNext: sql`${clients.invoiceNumberNext} + 1` })
    .where(eq(clients.id, client.id))
    .returning({
      reservedNumber: clients.invoiceNumberNext, // this is the post-increment value
      prefix: clients.invoiceNumberPrefix,
    });

  // Post-increment value is (actual + 1). We wanted the pre-increment value
  // for the number, so subtract one.
  const reservedNumber = (reserved?.reservedNumber ?? 1) - 1;
  const prefix = reserved?.prefix ?? '';
  const number = generateInvoiceNumber({
    invoiceNumberPrefix: prefix,
    invoiceNumberNext: reservedNumber,
  });

  const amounts = calculateAmounts(booking.price, client.ivaRate);
  const invoiceType = determineInvoiceType(null); // customer NIF not captured on booking yet — always ticket for now

  const issueDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [inserted] = await db
    .insert(invoices)
    .values({
      clientId: client.id,
      bookingId: booking.id,
      number,
      issueDate,
      customerName: booking.customerName ?? null,
      customerPhone: booking.customerPhone,
      customerNif: null,
      customerAddress: null,
      serviceName: booking.service,
      barberName: booking.barber ?? null,
      subtotalCents: amounts.subtotalCents,
      ivaRate: client.ivaRate,
      ivaAmountCents: amounts.ivaAmountCents,
      totalCents: amounts.totalCents,
      currency: 'EUR',
      type: invoiceType,
      status: 'issued',
    })
    .returning({ id: invoices.id, number: invoices.number });

  return {
    invoiceId: inserted.id,
    number: inserted.number,
    alreadyExisted: false,
  };
}

/** Tag on a booking row cast — isolates the check so callers don't duplicate logic. */
export function shouldAutoInvoiceBooking(booking: Pick<BookingRow, 'status' | 'price'>): boolean {
  return booking.status === 'confirmed' && booking.price != null;
}

/**
 * Fire-and-forget variant for use in API route handlers — never throws,
 * never blocks. Logs failures to the server console so they surface in
 * Vercel logs without breaking booking creation.
 */
export function tryAutoInvoiceInBackground(bookingId: string): void {
  generateInvoiceFromBooking(bookingId).catch((err) => {
    console.error('[invoicing] auto-invoice failed for booking', bookingId, err);
  });
}
