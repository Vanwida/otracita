import { db } from '@/db';
import { clients, bookings, invoices } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { notifyAlex } from '@/lib/notify-alex';
import { chainRegistroAlta, getEmisorNif } from '@/lib/verifactu/chain';
import { buildQrUrl, type VerifactuEnv } from '@/lib/verifactu/qr';
import { formatFechaExpedicion, centsToDecimal } from '@/lib/verifactu/format';
import type { TipoFactura } from '@/lib/verifactu/hash';

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

/**
 * Maximum total (in cents) for a ticket simplificado (B2C) without NIF.
 * Real Decreto 1619/2012 art. 4: operations above this threshold MUST be
 * emitted as a factura completa with the buyer's NIF and address.
 * 40 000 cents = 400,00 €.
 */
export const TICKET_MAX_CENTS = 40000;

/**
 * Parse `YYYY-MM` into a half-open date range `[start, endExclusive)` where
 * both boundaries are `YYYY-MM-DD` strings. The end is the first day of the
 * *next* month — use with a strict-less-than filter (`lt`) so day 1 of the
 * following month is NOT included. Using `lte` with an inclusive end leaks
 * the following month's first day into "this month"'s totals.
 *
 * Returns null for malformed input.
 */
export function monthRangeInclusive(
  month: string,
): { start: string; endExclusive: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  if (m < 0 || m > 11) return null;
  const start = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
  const endExclusive = new Date(Date.UTC(year, m + 1, 1)).toISOString().slice(0, 10);
  return { start, endExclusive };
}

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
type ClientRow = typeof clients.$inferSelect;

export interface GenerateInvoiceResult {
  invoiceId: string;
  number: string;
  alreadyExisted: boolean;
}

/**
 * Does the tenant have a complete emisor fiscal block as required by
 * Real Decreto 1619/2012 art. 6 (name + NIF + full postal address)?
 * We NEVER emit a fiscal doc without these — the invoice would be legally
 * invalid and expose the barber to sanctions.
 */
function hasCompleteFiscalEmisor(
  client: Pick<
    ClientRow,
    'fiscalName' | 'fiscalNif' | 'fiscalAddress' | 'fiscalPostalCode' | 'fiscalCity'
  >,
): boolean {
  return Boolean(
    client.fiscalName &&
      client.fiscalName.trim() &&
      client.fiscalNif &&
      client.fiscalNif.trim() &&
      client.fiscalAddress &&
      client.fiscalAddress.trim() &&
      client.fiscalPostalCode &&
      client.fiscalPostalCode.trim() &&
      client.fiscalCity &&
      client.fiscalCity.trim(),
  );
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

  // Legal guard — never emit a fiscal doc for a tenant with an incomplete
  // emisor block. The enabled toggle already checks this at save time, but
  // this path protects against data that pre-dates the check or gets wiped.
  if (!hasCompleteFiscalEmisor(client)) {
    console.error(
      '[invoicing] refusing to auto-invoice — tenant has incomplete fiscal emisor block',
      { clientId: client.id, bookingId },
    );
    return null;
  }

  // Ticket max — Real Decreto 1619/2012 art. 4: amounts above 400€ require a
  // full factura with the buyer's NIF. Bookings don't capture NIF yet, so
  // any high-value booking must fall through to the manual path. Alert Alex
  // so the barber can emit the correct doc manually from the dashboard.
  const guardAmounts = calculateAmounts(booking.price, client.ivaRate);
  if (guardAmounts.totalCents > TICKET_MAX_CENTS) {
    console.error(
      '[invoicing] refusing to auto-invoice — booking exceeds TICKET_MAX_CENTS without NIF',
      { clientId: client.id, bookingId, totalCents: guardAmounts.totalCents },
    );
    // Fire-and-forget WhatsApp — never block the booking path on notify.
    notifyAlex(
      `⚠️ Booking ${bookingId} excede 400€ sin NIF del cliente. Emite factura manualmente con NIF desde Dashboard → Facturación → Nueva factura.`,
    ).catch((err) => console.error('[invoicing] notifyAlex failed:', err));
    return null;
  }

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

  const amounts = guardAmounts;
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

  // Sellado VeriFactu (hash + QR) tras la emisión. Best-effort, no tumba
  // el flujo si falla — el estado queda 'error' para reintentar.
  await sealInvoiceVerifactu(
    client.id,
    inserted.id,
    inserted.number,
    issueDate,
    amounts.ivaAmountCents,
    amounts.totalCents,
    'F1', // auto-facturación de booking = ordinaria
  );

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

// -----------------------------------------------------------------------------
// VeriFactu sealing — sella una factura recién emitida con la cadena de
// hash + URL QR. Se llama después de cada inserción en `invoices`.
//
// - Si el emisor no tiene NIF → log warning y skip (no podemos hashear sin
//   NIF válido). El SealVerifactuStatus queda 'error' para no enviarlo.
// - Si algo falla en el hash → status='error' + msg. Nunca tumba la emisión
//   de la factura en sí; el barbero sigue viendo su factura, el envío queda
//   pendiente.
// -----------------------------------------------------------------------------
async function sealInvoiceVerifactu(
  clientId: string,
  invoiceId: string,
  invoiceNumber: string,
  issueDateIso: string, // YYYY-MM-DD
  ivaAmountCents: number,
  totalCents: number,
  tipoFactura: TipoFactura = 'F1',
): Promise<void> {
  try {
    const nif = await getEmisorNif(clientId);
    const fechaExpedicion = new Date(`${issueDateIso}T00:00:00`);

    // Calcula huella + encadena + persiste.
    const chainResult = await chainRegistroAlta({
      clientId,
      invoiceId,
      emisorNif: nif,
      serieNumero: invoiceNumber,
      tipoFactura,
      cuotaTotalCents: ivaAmountCents,
      importeTotalCents: totalCents,
      fechaExpedicion,
    });

    // Construye URL QR con los mismos 4 parámetros y persiste.
    const env: VerifactuEnv = (process.env.VERIFACTU_ENV as VerifactuEnv) ?? 'pruebas';
    const qrUrl = buildQrUrl({
      nif,
      numserie: invoiceNumber,
      fecha: formatFechaExpedicion(fechaExpedicion),
      importe: centsToDecimal(totalCents),
      env,
      verifactu: true,
    });

    await db.update(invoices).set({ qrUrl }).where(eq(invoices.id, invoiceId));

    void chainResult; // usado arriba; evitamos warning de variable no usada
  } catch (err) {
    // Never throws: la emisión fiscal de la factura está hecha (la row ya
    // existe en DB). Solo logeamos el fallo de sellado VeriFactu para que
    // saltemos a M4 (envío a AEAT) sepamos que hay que reintentar.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[verifactu] seal failed for invoice ${invoiceId}:`, msg);
    await db
      .update(invoices)
      .set({
        verifactuStatus: 'error',
        verifactuErrorMsg: msg.slice(0, 500),
      })
      .where(eq(invoices.id, invoiceId))
      .catch(() => null);
  }
}

// -----------------------------------------------------------------------------
// Manual invoicing — walk-in support.
//
// Barbers frequently get customers who walk in off the street with no prior
// booking. Without a way to emit a fiscal doc for those, the barber must keep
// a parallel ticket book (defeating the point of integrated invoicing). This
// path lets them create a factura/ticket directly from the dashboard, reusing
// the same atomic numbering sequence as booking-driven invoices.
// -----------------------------------------------------------------------------

export interface ManualInvoiceInput {
  /** YYYY-MM-DD. Defaults to today if omitted. */
  issueDate?: string;
  customerName: string;
  customerPhone?: string | null;
  /** Presence of a NIF triggers `type='invoice'` instead of `type='ticket'`. */
  customerNif?: string | null;
  customerAddress?: string | null;
  serviceName: string;
  barberName?: string | null;
  /** Price in euros, VAT-inclusive (Spanish retail convention). */
  priceInEuros: number;
  notes?: string | null;
}

export interface ManualInvoiceValidationError {
  field: string;
  message: string;
}

/**
 * Validate a manual-invoice payload without touching the database. Returns a
 * list of user-facing errors — caller maps to 400 response.
 */
export function validateManualInvoiceInput(
  input: Partial<ManualInvoiceInput>,
): ManualInvoiceValidationError[] {
  const errors: ManualInvoiceValidationError[] = [];

  if (!input.customerName || !input.customerName.trim()) {
    errors.push({ field: 'customerName', message: 'El nombre del cliente es obligatorio.' });
  }
  if (!input.serviceName || !input.serviceName.trim()) {
    errors.push({ field: 'serviceName', message: 'El concepto del servicio es obligatorio.' });
  }
  if (input.priceInEuros == null || Number.isNaN(Number(input.priceInEuros))) {
    errors.push({ field: 'priceInEuros', message: 'El precio es obligatorio.' });
  } else if (Number(input.priceInEuros) <= 0) {
    errors.push({ field: 'priceInEuros', message: 'El precio debe ser mayor que cero.' });
  }
  if (input.issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) {
    errors.push({ field: 'issueDate', message: 'Fecha inválida (formato YYYY-MM-DD).' });
  }

  const nif = input.customerNif?.trim() || '';
  const address = input.customerAddress?.trim() || '';
  const priceNum = Number(input.priceInEuros);
  const priceOk = Number.isFinite(priceNum) && priceNum > 0;

  // Real Decreto 1619/2012 art. 4 — sales over 400€ cannot be emitted as
  // ticket simplificado; they require a factura completa with the buyer's NIF.
  if (priceOk && Math.round(priceNum * 100) > TICKET_MAX_CENTS && !nif) {
    errors.push({
      field: 'customerNif',
      message:
        'Las ventas superiores a 400€ requieren NIF del cliente (factura completa, no ticket simplificado).',
    });
  }

  // Factura completa (tenemos NIF) requires the customer's postal address
  // per Real Decreto 1619/2012 art. 6.
  if (nif && !address) {
    errors.push({
      field: 'customerAddress',
      message: 'Dirección del cliente obligatoria en facturas con NIF.',
    });
  }

  return errors;
}

/**
 * Generate a manual invoice for the given client. No booking row is linked
 * (bookingId stays null). Uses the same atomic `invoiceNumberNext` counter as
 * booking-driven invoices so numbering remains strictly sequential.
 *
 * Returns null if the client has invoicing disabled — caller should surface
 * a friendly error to the UI.
 */
export async function generateManualInvoice(
  clientId: string,
  input: ManualInvoiceInput,
): Promise<GenerateInvoiceResult | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId));

  if (!client) return null;
  if (!client.invoicingEnabled) return null;

  // Legal guard — never emit a fiscal doc for a tenant with an incomplete
  // emisor block (art. 6 RD 1619/2012). This protects the manual path too,
  // not just the auto one.
  if (!hasCompleteFiscalEmisor(client)) {
    console.error(
      '[invoicing] refusing to emit manual invoice — tenant has incomplete fiscal emisor block',
      { clientId: client.id },
    );
    return null;
  }

  const amounts = calculateAmounts(input.priceInEuros, client.ivaRate);
  const nif = input.customerNif?.trim() || null;
  const address = input.customerAddress?.trim() || null;

  // Ticket max — art. 4 RD 1619/2012: >400€ requires a factura completa
  // with the buyer's NIF. Throws so the API layer returns 400 to the form.
  if (amounts.totalCents > TICKET_MAX_CENTS && !nif) {
    throw new Error(
      'Las ventas superiores a 400€ requieren NIF del cliente (factura completa, no ticket simplificado).',
    );
  }

  // Factura with NIF always requires the buyer's postal address (art. 6).
  if (nif && !address) {
    throw new Error('Dirección del cliente obligatoria en facturas con NIF.');
  }

  // Atomically reserve the next number — same pattern as the booking path so
  // concurrent manual + auto invoicing cannot collide on a sequence value.
  const [reserved] = await db
    .update(clients)
    .set({ invoiceNumberNext: sql`${clients.invoiceNumberNext} + 1` })
    .where(eq(clients.id, client.id))
    .returning({
      reservedNumber: clients.invoiceNumberNext,
      prefix: clients.invoiceNumberPrefix,
    });

  const reservedNumber = (reserved?.reservedNumber ?? 1) - 1;
  const prefix = reserved?.prefix ?? '';
  const number = generateInvoiceNumber({
    invoiceNumberPrefix: prefix,
    invoiceNumberNext: reservedNumber,
  });

  const invoiceType = determineInvoiceType(nif);
  const issueDate = input.issueDate || new Date().toISOString().slice(0, 10);

  const [inserted] = await db
    .insert(invoices)
    .values({
      clientId: client.id,
      bookingId: null,
      number,
      issueDate,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone?.trim() || null,
      customerNif: nif,
      customerAddress: address,
      serviceName: input.serviceName.trim(),
      barberName: input.barberName?.trim() || null,
      subtotalCents: amounts.subtotalCents,
      ivaRate: client.ivaRate,
      ivaAmountCents: amounts.ivaAmountCents,
      totalCents: amounts.totalCents,
      currency: 'EUR',
      type: invoiceType,
      status: 'issued',
      notes: input.notes?.trim() || null,
    })
    .returning({ id: invoices.id, number: invoices.number });

  // Sellado VeriFactu también en facturación manual (walk-ins).
  await sealInvoiceVerifactu(
    client.id,
    inserted.id,
    inserted.number,
    issueDate,
    amounts.ivaAmountCents,
    amounts.totalCents,
    'F1',
  );

  return {
    invoiceId: inserted.id,
    number: inserted.number,
    alreadyExisted: false,
  };
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

/**
 * Mark any invoice attached to the given booking as `voided` when the
 * underlying booking is cancelled. MVP-level handling: the invoice row is
 * annulled in-place so it stops counting toward stats and exports, and Alex
 * is notified so the barber knows to emit a factura rectificativa manually
 * if the customer already paid.
 *
 * We intentionally do NOT implement the full rectificativa (new invoice
 * row with negative amounts, cross-linked to the original) in this pass —
 * that's post-launch work once real traffic has validated the flow.
 *
 * Only `status = 'issued'` rows are voided — this is idempotent (calling it
 * on an already-voided invoice is a no-op) and cannot accidentally void a
 * previously-rectified invoice.
 *
 * Returns the number of invoice rows voided (0 or 1 in practice).
 */
export async function voidInvoicesForCancelledBooking(
  bookingId: string,
): Promise<number> {
  const voided = await db
    .update(invoices)
    .set({ status: 'voided' })
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        eq(invoices.status, 'issued'),
      ),
    )
    .returning({
      id: invoices.id,
      number: invoices.number,
      clientId: invoices.clientId,
      customerName: invoices.customerName,
    });

  if (voided.length === 0) return 0;

  // Fire-and-forget WhatsApp alert — barber needs to know that if the
  // customer already paid, they must emit a rectificativa manually.
  for (const v of voided) {
    const who = v.customerName ? `cliente ${v.customerName}` : 'cliente sin nombre';
    const message = `⚠️ Factura anulada (void) — ${who}, booking ${bookingId}. Si el cliente ya pagó debes emitir factura rectificativa manual.`;
    notifyAlex(message).catch((err) => {
      console.error('[invoicing] notifyAlex (void) failed:', err);
    });
  }

  return voided.length;
}

/**
 * Fire-and-forget variant — safe to call from any booking-cancel path.
 * Never throws, logs on error so Vercel logs catch silent failures.
 */
export function tryVoidInvoicesInBackground(bookingId: string): void {
  voidInvoicesForCancelledBooking(bookingId).catch((err) => {
    console.error('[invoicing] void-on-cancel failed for booking', bookingId, err);
  });
}
