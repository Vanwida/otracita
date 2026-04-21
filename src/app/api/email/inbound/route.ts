import type { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { clients, bookings, emailParseLog } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseBooksyEmail, type BooksyBookingData } from '@/lib/booksy-email-parser';
import {
  extractBooksyDataWithLlm,
  findMissingCriticalFields,
  type CriticalField,
} from '@/lib/booksy-email-llm';
import { notifyAlex } from '@/lib/notify-alex';
import { tryAutoInvoiceInBackground } from '@/lib/invoicing';

interface PostmarkInboundPayload {
  To?: string;
  OriginalRecipient?: string;
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  MessageID?: string;
}

/** Status values stored in `email_parse_log.status`. Keep in sync with schema comment. */
type ParseStatus = 'full' | 'partial' | 'failed' | 'unmatched_client' | 'llm_assisted';
/** Which engine produced the `parsedFields` we stored. */
type ParseSource = 'regex' | 'llm';

/**
 * How many chars of the raw body to persist for post-mortem forensics.
 * Kept generous (2000) because silent regex failures need the full text
 * to diagnose — 500 was not enough on the old `bookings.rawEmailSnippet`.
 */
const RAW_LOG_CHARS = 2000;
/** Shorter snippet bundled into the WhatsApp alert to Alex. */
const ALERT_SNIPPET_CHARS = 200;

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return '';
  const match = raw.match(/([^<\s]+@[^>\s]+)/);
  if (!match) return '';
  return match[1].replace(/[<>]/g, '').toLowerCase();
}

function buildBookingValues(
  clientId: string,
  data: BooksyBookingData,
  rawSnippet: string,
) {
  return {
    clientId,
    customerPhone: data.customerPhone ?? 'booksy',
    customerName: data.customerName ?? null,
    service: data.service ?? 'Servicio Booksy',
    barber: data.barber ?? null,
    date: data.date ?? new Date().toISOString().split('T')[0],
    time: data.time ?? '10:00',
    duration: data.duration ?? 30,
    price: data.price ?? null,
    status: 'confirmed' as const,
    source: 'booksy' as const,
    booksyBookingId: data.booksyBookingId ?? null,
    rawEmailSnippet: rawSnippet.slice(0, 500), // bookings table keeps a short preview
  };
}

/**
 * Persist or update a booking based on a parsed Booksy email.
 * Returns the booking id if one was created/updated, or null if the event
 * targeted a booking we don't have on file.
 */
async function applyBookingFromData(
  clientId: string,
  data: BooksyBookingData,
  rawSnippet: string,
): Promise<string | null> {
  if (data.type === 'new') {
    const values = buildBookingValues(clientId, data, rawSnippet);
    if (data.booksyBookingId) {
      const [existing] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.clientId, clientId),
            eq(bookings.booksyBookingId, data.booksyBookingId),
          ),
        );
      if (existing) return existing.id;
    }
    const [inserted] = await db.insert(bookings).values(values).returning({ id: bookings.id });
    return inserted?.id ?? null;
  }

  if (data.type === 'modified' && data.booksyBookingId) {
    const [existing] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, clientId),
          eq(bookings.booksyBookingId, data.booksyBookingId),
        ),
      );

    if (existing) {
      await db
        .update(bookings)
        .set({
          date: data.date ?? existing.date,
          time: data.time ?? existing.time,
          barber: data.barber ?? existing.barber,
          service: data.service ?? existing.service,
          rawEmailSnippet: rawSnippet.slice(0, 500),
        })
        .where(eq(bookings.id, existing.id));
      return existing.id;
    }

    // Modification for a booking we never imported — treat as new.
    const [inserted] = await db
      .insert(bookings)
      .values(buildBookingValues(clientId, data, rawSnippet))
      .returning({ id: bookings.id });
    return inserted?.id ?? null;
  }

  if (data.type === 'cancelled' && data.booksyBookingId) {
    const [existing] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, clientId),
          eq(bookings.booksyBookingId, data.booksyBookingId),
        ),
      );
    if (existing) {
      await db
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(bookings.id, existing.id));
      return existing.id;
    }
  }

  return null;
}

interface AlertArgs {
  status: ParseStatus;
  businessName: string | null;
  subject: string;
  fromEmail: string;
  toEmail: string;
  rawSnippet: string;
  missingFields: CriticalField[];
}

function buildAlertMessage({
  status,
  businessName,
  subject,
  fromEmail,
  toEmail,
  rawSnippet,
  missingFields,
}: AlertArgs): string {
  const client = businessName ?? 'desconocido';
  const snippet = rawSnippet.slice(0, ALERT_SNIPPET_CHARS);
  const missing = missingFields.length > 0 ? ` · faltan: ${missingFields.join(', ')}` : '';

  switch (status) {
    case 'failed':
      return `🚨 Parse Booksy FAILED — cliente ${client} · "${subject}"${missing}\n\nRaw: ${snippet}\n\nBooksy puede haber cambiado formato. URGENTE.`;
    case 'llm_assisted':
      return `⚠️ Parse fallback LLM — cliente ${client} · booking reservado con IA. Revisa el email para ver si el formato cambió.\n\n"${subject}"`;
    case 'partial':
      return `⚠️ Parse Booksy PARCIAL — cliente ${client} · "${subject}"${missing}\n\nRevisa el parser antes de que peten más emails.`;
    case 'unmatched_client':
      return `🔔 Email inbound sin match — de ${fromEmail} a ${toEmail} · "${subject}"`;
    case 'full':
      // Not used — we don't alert on clean parses.
      return '';
  }
}

/**
 * Alert statuses that trigger a notification to Alex. 'full' is intentionally
 * excluded: success is the happy path, alerting on it would be noise.
 */
const ALERT_STATUSES: ReadonlySet<ParseStatus> = new Set<ParseStatus>([
  'failed',
  'partial',
  'llm_assisted',
  'unmatched_client',
]);

/**
 * Fire-and-forget alert + log flag update. Runs in the background so the
 * webhook response is never blocked on WhatsApp delivery (Postmark retries
 * on slow responses, which would create duplicate bookings).
 */
function dispatchAlert(
  logId: string,
  status: ParseStatus,
  message: string,
): void {
  notifyAlex(message)
    .then(async (ok) => {
      if (!ok) return;
      try {
        await db
          .update(emailParseLog)
          .set({ alertSent: true })
          .where(eq(emailParseLog.id, logId));
      } catch (err) {
        console.error('[email-inbound] could not mark alertSent:', err);
      }
    })
    .catch((err) => {
      console.error('[email-inbound] notifyAlex rejected:', err);
    });
}

export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.POSTMARK_INBOUND_SECRET;
  if (!secret) {
    console.error('POSTMARK_INBOUND_SECRET not configured — rejecting inbound email webhook');
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const signature = req.headers.get('x-postmark-signature') ?? '';
  if (!verifySignature(body, signature, secret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: PostmarkInboundPayload;
  try {
    payload = JSON.parse(body) as PostmarkInboundPayload;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const toEmail = extractEmailAddress(payload.To ?? payload.OriginalRecipient);
  const fromEmail = extractEmailAddress(payload.From);
  const subject = payload.Subject ?? '';
  const textBody =
    payload.TextBody ??
    (payload.HtmlBody ? payload.HtmlBody.replace(/<[^>]+>/g, ' ') : '');
  const rawSnippet = textBody.slice(0, RAW_LOG_CHARS);

  try {
    if (!toEmail) {
      // No recipient at all — can't even identify the client. Log and move on.
      await db.insert(emailParseLog).values({
        clientId: null,
        toEmail: null,
        fromEmail,
        subject,
        rawSnippet,
        status: 'unmatched_client',
        errorMessage: 'Missing To/OriginalRecipient in payload',
      });
      return Response.json({ ok: true });
    }

    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.booksyInboundEmail, toEmail));

    if (!client) {
      const [log] = await db
        .insert(emailParseLog)
        .values({
          clientId: null,
          toEmail,
          fromEmail,
          subject,
          rawSnippet,
          status: 'unmatched_client',
        })
        .returning({ id: emailParseLog.id });

      const msg = buildAlertMessage({
        status: 'unmatched_client',
        businessName: null,
        subject,
        fromEmail,
        toEmail,
        rawSnippet,
        missingFields: [],
      });
      if (log?.id) dispatchAlert(log.id, 'unmatched_client', msg);

      return Response.json({ ok: true });
    }

    // --- 1. Regex parse (fast, cheap, primary path) --------------------------
    const regexData = parseBooksyEmail(subject, textBody);
    let finalData: BooksyBookingData | null = regexData;
    let parseSource: ParseSource = 'regex';
    let missingFields = findMissingCriticalFields(regexData);

    // --- 2. LLM fallback if regex failed or returned partial data ------------
    const needsFallback = !regexData || missingFields.length > 0;
    if (needsFallback) {
      const llmData = await extractBooksyDataWithLlm(subject, textBody);
      if (llmData) {
        const llmMissing = findMissingCriticalFields(llmData);
        // Only adopt the LLM result if it's strictly better than regex.
        if (llmMissing.length < missingFields.length) {
          finalData = llmData;
          parseSource = 'llm';
          missingFields = llmMissing;
        }
      }
    }

    // --- 3. Classify the outcome ---------------------------------------------
    let status: ParseStatus;
    if (!finalData) {
      status = 'failed';
    } else if (missingFields.length === 0) {
      status = parseSource === 'llm' ? 'llm_assisted' : 'full';
    } else {
      status = 'partial';
    }

    // --- 4. Apply the booking if we have enough data -------------------------
    // Only insert/update when we have a usable type AND no critical fields
    // missing. A 'partial' or 'failed' parse MUST NOT create a zombie booking.
    let bookingId: string | null = null;
    let errorMessage: string | null = null;

    if (finalData && status !== 'partial' && status !== 'failed') {
      try {
        bookingId = await applyBookingFromData(client.id, finalData, rawSnippet);
        // Auto-invoice when the tenant has it enabled. Safe on 'modified'
        // events too — `generateInvoiceFromBooking` is idempotent.
        if (bookingId && client.invoicingEnabled && finalData.type !== 'cancelled') {
          tryAutoInvoiceInBackground(bookingId);
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[email-inbound] applyBookingFromData failed:', err);
        // Downgrade the status — we extracted fields but couldn't persist.
        status = 'failed';
      }
    }

    // --- 5. Persist the log row ----------------------------------------------
    const [log] = await db
      .insert(emailParseLog)
      .values({
        clientId: client.id,
        toEmail,
        fromEmail,
        subject,
        rawSnippet,
        status,
        parseSource: finalData ? parseSource : null,
        parsedFields: finalData ?? null,
        missingFields: missingFields.length > 0 ? missingFields : null,
        bookingId,
        errorMessage,
      })
      .returning({ id: emailParseLog.id });

    // --- 6. Alert Alex in the background on anything not 'full' --------------
    if (ALERT_STATUSES.has(status) && log?.id) {
      const msg = buildAlertMessage({
        status,
        businessName: client.businessName,
        subject,
        fromEmail,
        toEmail,
        rawSnippet,
        missingFields,
      });
      dispatchAlert(log.id, status, msg);
    }
  } catch (error) {
    // Last-resort catch — a crash here would cause Postmark to retry and
    // create duplicates. Log the row as failed and carry on returning 200.
    console.error('Error processing inbound email webhook:', error);
    try {
      await db.insert(emailParseLog).values({
        clientId: null,
        toEmail,
        fromEmail,
        subject,
        rawSnippet,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } catch (logErr) {
      console.error('[email-inbound] could not even write the failure log:', logErr);
    }
  }

  return Response.json({ ok: true });
}
