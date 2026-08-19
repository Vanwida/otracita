// -----------------------------------------------------------------------------
// invoicing-math — funciones puras de cálculo fiscal, sin DB ni I/O.
//
// Vive separado de `invoicing.ts` para poder testearlas con `node --test`
// directo, sin depender del path alias `@/db` (que requiere resolver el
// tsconfig). Las usa `invoicing.ts` y los tests `invoicing.test.ts`.
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

/** A ticket simplificado (B2C) when the customer has no NIF, else a factura (B2B). */
export type InvoiceType = 'ticket' | 'invoice';

export interface InvoiceAmounts {
  subtotalCents: number;
  ivaAmountCents: number;
  totalCents: number;
}

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

/**
 * Given a price in EUROS (as typed by the barber / stored on the jsonb
 * service catalogue) and an IVA rate
 * percentage, return the Spanish breakdown in CENTS. The input price is
 * interpreted as VAT-inclusive (the retail convention).
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

// -----------------------------------------------------------------------------
// Líneas de factura (invoice_items) — helpers de cálculo y agregación.
//
// Cada línea es un servicio o producto con su unitario IVA-incluido. El
// subtotal (base) y la cuota se derivan POR LÍNEA con la misma fórmula que
// `calculateAmounts`. Los totales de la factura son la SUMA de los totales
// de cada línea — así garantizamos que `sum(items.totalCents) == invoice.totalCents`
// sin off-by-1 cents acumulados en el invoice.
// -----------------------------------------------------------------------------

export type InvoiceLineKind = 'service' | 'product';

/** Entrada del caller: qué se vende, sin amounts derivados. */
export interface InvoiceLineDraft {
  kind: InvoiceLineKind;
  name: string;
  quantity: number;
  /** Precio unitario IVA INCLUIDO en céntimos. */
  unitPriceCents: number;
  /** Solo presente cuando `kind='product'` y proviene de una venta registrada. */
  productSaleId?: string | null;
}

/** Línea con amounts ya calculados, lista para INSERT en invoice_items. */
export interface InvoiceLineComputed extends InvoiceLineDraft {
  totalCents: number;
  subtotalCents: number;
  ivaAmountCents: number;
}

/**
 * Calcula amounts de una línea (unit IVA-incl × qty → subtotal/iva/total).
 * Aplica el mismo round-and-absorb que `calculateAmounts` para que el IVA
 * absorba el redondeo y el total quede exacto.
 */
export function buildLineItem(
  draft: InvoiceLineDraft,
  ivaRate: number,
): InvoiceLineComputed {
  const totalCents = draft.unitPriceCents * draft.quantity;
  const subtotalCents = Math.round(totalCents / (1 + ivaRate / 100));
  const ivaAmountCents = totalCents - subtotalCents;
  return { ...draft, totalCents, subtotalCents, ivaAmountCents };
}

/** Suma los amounts de varias líneas. */
export function aggregateLineAmounts(lines: InvoiceLineComputed[]): InvoiceAmounts {
  return lines.reduce<InvoiceAmounts>(
    (acc, l) => ({
      subtotalCents: acc.subtotalCents + l.subtotalCents,
      ivaAmountCents: acc.ivaAmountCents + l.ivaAmountCents,
      totalCents: acc.totalCents + l.totalCents,
    }),
    { subtotalCents: 0, ivaAmountCents: 0, totalCents: 0 },
  );
}

/**
 * Construye el `serviceName` legible que va en el campo legacy `invoices.service_name`.
 * Mantiene compatibilidad con el libro mensual y exports CSV/XLSX que aún
 * no leen invoice_items: una sola línea descriptiva del contenido de la factura.
 */
export function composeServiceName(lines: InvoiceLineComputed[]): string {
  const service = lines.find((l) => l.kind === 'service');
  const products = lines.filter((l) => l.kind === 'product');

  if (products.length === 0) {
    return service?.name ?? 'Servicio';
  }

  const productCount = products.reduce((acc, p) => acc + p.quantity, 0);
  const productLabel = productCount === 1 ? '1 producto' : `${productCount} productos`;

  if (!service) return productLabel;
  return `${service.name} + ${productLabel}`;
}
