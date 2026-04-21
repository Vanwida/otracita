import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { bookings, emailParseLog } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getAdminUser } from '@/lib/auth/require-admin';
import {
  extractBooksyDataWithLlm,
  findMissingCriticalFields,
} from '@/lib/booksy-email-llm';
import type { BooksyBookingData } from '@/lib/booksy-email-parser';
import { tryVoidInvoicesInBackground } from '@/lib/invoicing';

/**
 * Replay a historical email_parse_log row through the LLM extractor and,
 * if we get a clean booking this time, insert/update the booking and mark
 * the log as llm_assisted. Used after fixing the regex parser (or when
 * Booksy ships a new format) to recover bookings that silently failed.
 *
 * Auth: admin only. Never triggers alerts — this is a manual operator path.
 */

export const dynamic = 'force-dynamic';

function buildBookingValues(clientId: string, data: BooksyBookingData, rawSnippet: string) {
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
    rawEmailSnippet: rawSnippet.slice(0, 500),
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getAdminUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 });
  }

  const [log] = await db
    .select()
    .from(emailParseLog)
    .where(eq(emailParseLog.id, id));

  if (!log) {
    return Response.json({ error: 'Log not found' }, { status: 404 });
  }

  if (!log.clientId) {
    return Response.json(
      { error: 'Cannot reprocess: no client matched for this email' },
      { status: 400 },
    );
  }

  if (!log.rawSnippet) {
    return Response.json({ error: 'No raw snippet stored for this log' }, { status: 400 });
  }

  const llmData = await extractBooksyDataWithLlm(log.subject ?? '', log.rawSnippet);
  if (!llmData) {
    await db
      .update(emailParseLog)
      .set({
        errorMessage: `Reprocess attempt at ${new Date().toISOString()}: LLM returned null`,
      })
      .where(eq(emailParseLog.id, log.id));
    return Response.json({ ok: false, reason: 'LLM could not extract data' }, { status: 200 });
  }

  const missing = findMissingCriticalFields(llmData);
  if (missing.length > 0) {
    await db
      .update(emailParseLog)
      .set({
        parseSource: 'llm',
        parsedFields: llmData,
        missingFields: missing,
        errorMessage: `Reprocess at ${new Date().toISOString()}: still missing ${missing.join(', ')}`,
      })
      .where(eq(emailParseLog.id, log.id));
    return Response.json({ ok: false, reason: 'Still missing critical fields', missing });
  }

  // Apply the booking the same way the live webhook does, but inline here
  // because the shared helper lives in the route file and importing from
  // a route handler is a Next.js anti-pattern. Keep it short.
  let bookingId: string | null = null;
  if (llmData.type === 'new' || llmData.type === 'modified') {
    if (llmData.booksyBookingId) {
      const [existing] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
          and(
            eq(bookings.clientId, log.clientId),
            eq(bookings.booksyBookingId, llmData.booksyBookingId),
          ),
        );
      if (existing) {
        await db
          .update(bookings)
          .set({
            date: llmData.date ?? undefined,
            time: llmData.time ?? undefined,
            barber: llmData.barber ?? undefined,
            service: llmData.service ?? undefined,
            rawEmailSnippet: log.rawSnippet.slice(0, 500),
          })
          .where(eq(bookings.id, existing.id));
        bookingId = existing.id;
      }
    }
    if (!bookingId) {
      const [inserted] = await db
        .insert(bookings)
        .values(buildBookingValues(log.clientId, llmData, log.rawSnippet))
        .returning({ id: bookings.id });
      bookingId = inserted?.id ?? null;
    }
  } else if (llmData.type === 'cancelled' && llmData.booksyBookingId) {
    const [existing] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.clientId, log.clientId),
          eq(bookings.booksyBookingId, llmData.booksyBookingId),
        ),
      );
    if (existing) {
      await db
        .update(bookings)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(bookings.id, existing.id));
      // Void any attached invoice (MVP).
      tryVoidInvoicesInBackground(existing.id);
      bookingId = existing.id;
    }
  }

  await db
    .update(emailParseLog)
    .set({
      status: 'llm_assisted',
      parseSource: 'llm',
      parsedFields: llmData,
      missingFields: null,
      bookingId,
      errorMessage: `Reprocessed at ${new Date().toISOString()} by ${user.email}`,
    })
    .where(eq(emailParseLog.id, log.id));

  return Response.json({ ok: true, bookingId, data: llmData });
}
