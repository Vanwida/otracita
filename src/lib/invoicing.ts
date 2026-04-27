import { db } from '@/db';
import { clients, bookings, invoices, invoiceItems, productSales } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { notifyAlex } from '@/lib/notify-alex';
import { chainRegistroAlta, getEmisorNif } from '@/lib/verifactu/chain';
import { buildQrUrl, type VerifactuEnv } from '@/lib/verifactu/qr';
import { formatFechaExpedicion, centsToDecimal } from '@/lib/verifactu/format';
import type { TipoFactura } from '@/lib/verifactu/hash';
import {
  TICKET_MAX_CENTS,
  monthRangeInclusive,
  generateInvoiceNumber,
  calculateAmounts,
  determineInvoiceType,
  looksLikeValidNif,
  buildLineItem,
  aggregateLineAmounts,
  composeServiceName,
  type InvoiceAmounts,
  type InvoiceType,
  type InvoiceLineKind,
  type InvoiceLineDraft,
  type InvoiceLineComputed,
} from '@/lib/invoicing-math';

// Re-exports — call-sites históricos de `@/lib/invoicing` siguen
// funcionando sin cambiar imports.
export {
  TICKET_MAX_CENTS,
  monthRangeInclusive,
  generateInvoiceNumber,
  calculateAmounts,
  determineInvoiceType,
  looksLikeValidNif,
  buildLineItem,
  aggregateLineAmounts,
  composeServiceName,
};
export type { InvoiceAmounts, InvoiceType, InvoiceLineKind, InvoiceLineDraft, InvoiceLineComputed };

// -----------------------------------------------------------------------------
// Invoicing helpers (con I/O) — tickets/facturas que la barbería emite a sus
// propios clientes. Las funciones puras de cálculo viven en
// `./invoicing-math.ts` (importadas + re-exportadas arriba para compat).
//
// Auto-facturación: se dispara cuando el booking pasa a `completed`
// (botón en agenda o cron de safety net). La factura combina el servicio
// del booking con productos vendidos durante la cita en una sola fila de
// `invoices` + N filas en `invoice_items`.
// -----------------------------------------------------------------------------

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
 * Composición de la factura:
 *   1. Línea de SERVICIO (precio del booking, IVA incluido) — siempre.
 *   2. Líneas de PRODUCTOS vendidos en este booking que aún no estén
 *      facturados (`product_sales.invoiced_at IS NULL`). Tras emitir,
 *      se estampa `invoiced_at = now()` en cada venta para evitar duplicados
 *      si el booking se reabre o un cron reintenta.
 *
 * Safe to call multiple times — idempotente sobre (clientId, bookingId):
 * si ya existe factura para el booking, devolvemos la existente sin tocar
 * `product_sales` (las ventas posteriores tras facturar quedan sin
 * facturar, por diseño — el barbero las cobra en otro flujo).
 *
 * Atomically increments `clients.invoice_number_next` para evitar colisión
 * de número bajo concurrencia (UNIQUE (clientId, number) es el guardián
 * último).
 *
 * Returns null si: booking no existe, `price == null` y no hay productos
 * tampoco, status='cancelled', el tenant no tiene invoicing habilitado, o
 * el bloque fiscal del emisor está incompleto. Callers tratan null como
 * "no-op, skip silently".
 */
export async function generateInvoiceFromBooking(
  bookingId: string,
): Promise<GenerateInvoiceResult | null> {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId));

  if (!booking) return null;
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

  // ── Construir líneas: servicio + productos pendientes de facturar ─────
  const lines: InvoiceLineComputed[] = [];

  if (booking.price != null && booking.price > 0) {
    lines.push(
      buildLineItem(
        {
          kind: 'service',
          name: booking.service,
          quantity: 1,
          unitPriceCents: Math.round(booking.price * 100),
        },
        client.ivaRate,
      ),
    );
  }

  const pendingSales = await db
    .select()
    .from(productSales)
    .where(
      and(
        eq(productSales.bookingId, bookingId),
        eq(productSales.clientId, client.id),
        isNull(productSales.invoicedAt),
      ),
    );

  // Cargar nombres de productos en una query (evita N+1).
  const productNameById = new Map<string, string>();
  if (pendingSales.length > 0) {
    const { products } = await import('@/db/schema');
    const productIds = Array.from(new Set(pendingSales.map((s) => s.productId)));
    const productRows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(
          eq(products.clientId, client.id),
          sql`${products.id} = ANY(${productIds})`,
        ),
      );
    for (const p of productRows) productNameById.set(p.id, p.name);
  }

  for (const sale of pendingSales) {
    lines.push(
      buildLineItem(
        {
          kind: 'product',
          name: productNameById.get(sale.productId) ?? 'Producto',
          quantity: sale.quantity,
          unitPriceCents: sale.unitPriceCents,
          productSaleId: sale.id,
        },
        client.ivaRate,
      ),
    );
  }

  // Si no hay nada que facturar (booking sin precio + sin productos),
  // no emitimos factura — devolvemos null silencioso. Esto puede ocurrir
  // con bookings legacy que se importaron sin precio.
  if (lines.length === 0) return null;

  const amounts = aggregateLineAmounts(lines);

  // Ticket max — Real Decreto 1619/2012 art. 4: amounts above 400€ require a
  // full factura con el NIF del cliente. Bookings no capturan NIF aún, así
  // que cualquier importe alto debe ir a la vía manual. Avisamos a Alex
  // para que el barbero emita el documento correcto desde el dashboard.
  if (amounts.totalCents > TICKET_MAX_CENTS) {
    console.error(
      '[invoicing] refusing to auto-invoice — booking exceeds TICKET_MAX_CENTS without NIF',
      { clientId: client.id, bookingId, totalCents: amounts.totalCents },
    );
    notifyAlex(
      `⚠️ Booking ${bookingId} excede 400€ sin NIF del cliente. Emite factura manualmente con NIF desde Dashboard → Facturación → Nueva factura.`,
    ).catch((err) => console.error('[invoicing] notifyAlex failed:', err));
    return null;
  }

  const invoiceType = determineInvoiceType(null); // customer NIF not captured on booking yet — always ticket for now
  const issueDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Compose the snapshot serviceName legible — concatenamos nombres para
  // que la columna legacy siga siendo descriptiva en exports/agregaciones
  // que aún no leen invoice_items (libro PDF, CSV, XLSX).
  const composedServiceName = composeServiceName(lines);

  // Atomically reserve the next number — pre-increment lookup pattern.
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
      serviceName: composedServiceName,
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

  // Persistir items + marcar ventas como facturadas. Si esto falla tras el
  // INSERT de invoices, la factura queda emitida sin items — recoverable
  // ejecutando un re-build manual; preferible a no emitir nada (ya tenemos
  // número fiscal asignado y debe seguir el correlativo).
  await persistInvoiceItemsAndMarkSales(inserted.id, lines);

  // Sellado VeriFactu (hash + QR) tras la emisión. Best-effort: no tumba
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

/**
 * Inserta items en la factura y marca las ventas de producto enlazadas
 * como facturadas. Llamada inmediatamente después de insertar la fila
 * de `invoices` — no debe usarse aislada.
 */
async function persistInvoiceItemsAndMarkSales(
  invoiceId: string,
  lines: InvoiceLineComputed[],
): Promise<void> {
  const itemRows = lines.map((line, idx) => ({
    invoiceId,
    kind: line.kind,
    name: line.name,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    subtotalCents: line.subtotalCents,
    ivaAmountCents: line.ivaAmountCents,
    totalCents: line.totalCents,
    productSaleId: line.productSaleId ?? null,
    displayOrder: idx,
  }));

  if (itemRows.length > 0) {
    await db.insert(invoiceItems).values(itemRows);
  }

  // Marcar ventas como facturadas (idempotencia futura).
  const saleIds = lines
    .map((l) => l.productSaleId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (saleIds.length > 0) {
    await db
      .update(productSales)
      .set({ invoicedAt: new Date() })
      .where(sql`${productSales.id} = ANY(${saleIds})`);
  }
}

/**
 * Tag on a booking row cast — isolates the check so callers don't duplicate logic.
 *
 * Gate cambiado de `confirmed` a `completed`: ahora la factura se emite
 * cuando el barbero cierra la cita (manualmente desde agenda o vía cron
 * de safety net). Esto permite incluir productos vendidos durante la cita
 * en la misma factura.
 *
 * `price` puede ser null si el booking se cobra solo con productos.
 */
export function shouldAutoInvoiceBooking(booking: Pick<BookingRow, 'status'>): boolean {
  return booking.status === 'completed';
}

// -----------------------------------------------------------------------------
// Rectificativa — crea una factura rectificativa (tipo R1-R5) que referencia
// a una original.
//
// Regla fiscal (RD 1619/2012 art. 15): la factura original NO se modifica
// nunca. La rectificativa es un documento independiente con su propio número
// de serie, propia huella VeriFactu, y un puntero a la original para
// auditoría.
//
// Motivos estándar:
//   R1: datos incorrectos del emisor/receptor
//   R2: importes incorrectos
//   R3: cliente ha devuelto el servicio (abono total)
//   R4: ajuste de IVA
//   R5: otros motivos
//
// La rectificativa puede ser:
//   - "Sustitución": reemplaza los importes de la original (nuevos importes)
//   - "Diferencia": solo el delta respecto a la original
// Para simplificar MVP usamos SIEMPRE "Sustitución" (lo más común en servicios
// B2C). El caller pasa los NUEVOS importes deseados.
//
// Si el motivo es R3 (cliente devuelve servicio) y newTotalCents=0, la
// rectificativa anula efectivamente la original dejándola a 0€.
// -----------------------------------------------------------------------------

export type RectificationMotivo = 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

export interface CreateRectificativaInput {
  /** ID de la factura original que se rectifica. */
  originalInvoiceId: string
  /** Motivo AEAT (R1-R5). */
  motivo: RectificationMotivo
  /** Nueva base imponible en céntimos. */
  newSubtotalCents: number
  /** Nueva cuota IVA en céntimos. */
  newIvaAmountCents: number
  /** Nuevo total en céntimos. */
  newTotalCents: number
  /** Nota opcional que se añade al campo notes. */
  notes?: string
}

export interface CreateRectificativaResult {
  invoiceId: string
  number: string
}

/**
 * Crea una factura rectificativa.
 *
 * Tenant-scoped: valida que la factura original pertenece al clientId.
 * Reserva un número correlativo nuevo (no reutiliza el de la original).
 * El tipo de factura es 'R1'..'R5' según el motivo. El sellado VeriFactu
 * corre al final con tipoFactura='RX' correspondiente (eso cambia el hash
 * vs 'F1' de una ordinaria).
 */
export async function createRectificativa(
  clientId: string,
  input: CreateRectificativaInput,
): Promise<CreateRectificativaResult> {
  // 1. Cargar la original y verificar ownership.
  const [original] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, input.originalInvoiceId), eq(invoices.clientId, clientId)))
  if (!original) throw new Error('Factura original no encontrada o no pertenece a este cliente.')
  if (original.status === 'rectified')
    throw new Error('Esta factura ya tiene una rectificativa emitida.')

  // 2. Cargar cliente y reservar número atómico.
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId))
  if (!client) throw new Error('Cliente no encontrado.')
  if (!client.invoicingEnabled)
    throw new Error('La facturación no está activa para este cliente.')

  const [reserved] = await db
    .update(clients)
    .set({ invoiceNumberNext: sql`${clients.invoiceNumberNext} + 1` })
    .where(eq(clients.id, clientId))
    .returning({
      reservedNumber: clients.invoiceNumberNext,
      prefix: clients.invoiceNumberPrefix,
    })
  const reservedNumber = (reserved?.reservedNumber ?? 1) - 1
  const prefix = reserved?.prefix ?? ''
  const number = generateInvoiceNumber({
    invoiceNumberPrefix: prefix,
    invoiceNumberNext: reservedNumber,
  })

  const issueDate = new Date().toISOString().slice(0, 10)

  // 3. Insertar la rectificativa.
  const [inserted] = await db
    .insert(invoices)
    .values({
      clientId,
      bookingId: null, // rectificativas son independientes de la reserva
      number,
      issueDate,
      customerName: original.customerName,
      customerPhone: original.customerPhone,
      customerNif: original.customerNif,
      customerAddress: original.customerAddress,
      serviceName: original.serviceName,
      barberName: original.barberName,
      subtotalCents: input.newSubtotalCents,
      ivaRate: original.ivaRate,
      ivaAmountCents: input.newIvaAmountCents,
      totalCents: input.newTotalCents,
      currency: original.currency,
      // Tipo comercial sigue siendo invoice/ticket según la original, pero
      // el campo `type` lo mantenemos (ticket simplificado vs factura
      // completa lo decide el cliente/NIF, no el hecho de ser rectificativa).
      type: original.type,
      status: 'issued',
      notes: input.notes
        ? `Rectificativa de ${original.number}. ${input.notes}`
        : `Rectificativa de ${original.number}. Motivo: ${input.motivo}`,
      rectifiesInvoiceId: original.id,
      rectificationMotivo: input.motivo,
    })
    .returning({ id: invoices.id, number: invoices.number })

  // Item único reflejando los nuevos importes (sustitución, no diferencia).
  // Mantenemos el formato de "TODA factura tiene items".
  await persistInvoiceItemsAndMarkSales(inserted.id, [
    {
      kind: 'service',
      name: original.serviceName,
      quantity: 1,
      unitPriceCents: input.newTotalCents,
      productSaleId: null,
      totalCents: input.newTotalCents,
      subtotalCents: input.newSubtotalCents,
      ivaAmountCents: input.newIvaAmountCents,
    },
  ])

  // 4. Marcar la original como "rectified" (soft-link; no se modifica nada
  //    que entre en el hash original — status no entra en el hash).
  await db
    .update(invoices)
    .set({ status: 'rectified' })
    .where(eq(invoices.id, original.id))

  // 5. Sellar VeriFactu con tipoFactura correspondiente al motivo.
  await sealInvoiceVerifactu(
    clientId,
    inserted.id,
    inserted.number,
    issueDate,
    input.newIvaAmountCents,
    input.newTotalCents,
    input.motivo, // R1..R5 — entra directamente como TipoFactura en el hash
  )

  return { invoiceId: inserted.id, number: inserted.number }
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

  // Item único — facturación manual (walk-in) hoy es siempre 1 línea de
  // servicio. Mantenemos consistencia: TODA factura nueva tiene items, así
  // PDF/UI/exports tienen un solo path.
  await persistInvoiceItemsAndMarkSales(inserted.id, [
    {
      kind: 'service',
      name: input.serviceName.trim(),
      quantity: 1,
      unitPriceCents: amounts.totalCents,
      productSaleId: null,
      totalCents: amounts.totalCents,
      subtotalCents: amounts.subtotalCents,
      ivaAmountCents: amounts.ivaAmountCents,
    },
  ]);

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
 * Fire-and-forget variant — se llama justo después de marcar el booking
 * como `completed` (botón en agenda o cron de safety net). Nunca lanza,
 * nunca bloquea. Failures van al log del servidor para auditarlos en
 * Vercel sin romper el flujo de cierre.
 *
 * IMPORTANT: el caller debe haber actualizado YA `bookings.status='completed'`
 * antes de llamar — internamente `generateInvoiceFromBooking` no comprueba
 * el status (acepta cualquier no-cancelled), porque queremos permitir
 * re-emisión manual desde el admin si algo falla. La gate de "solo facturar
 * cuando completed" la hacen los call-sites usando `shouldAutoInvoiceBooking`.
 */
export function tryAutoInvoiceForCompletedBooking(bookingId: string): void {
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
