import type { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/db';
import { clients, bookings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseBooksyEmail, type BooksyBookingData } from '@/lib/booksy-email-parser';

interface PostmarkInboundPayload {
  To?: string;
  OriginalRecipient?: string;
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  MessageID?: string;
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
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
    rawEmailSnippet: rawSnippet,
  };
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

  try {
    const toField = payload.To ?? payload.OriginalRecipient ?? '';
    const emailMatch = toField.match(/([^<\s]+@[^>\s]+)/);
    const toEmail = emailMatch ? emailMatch[1].replace(/[<>]/g, '').toLowerCase() : '';

    if (!toEmail) return Response.json({ ok: true });

    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.booksyInboundEmail, toEmail));

    if (!client) {
      console.log('No client found for inbound email:', toEmail);
      return Response.json({ ok: true });
    }

    const subject = payload.Subject ?? '';
    const textBody =
      payload.TextBody ??
      (payload.HtmlBody ? payload.HtmlBody.replace(/<[^>]+>/g, ' ') : '');

    const data = parseBooksyEmail(subject, textBody);

    if (!data) {
      console.log('Could not parse Booksy email for client:', client.id, 'Subject:', subject);
      return Response.json({ ok: true });
    }

    const rawSnippet = textBody.substring(0, 500);

    if (data.type === 'new') {
      const values = buildBookingValues(client.id, data, rawSnippet);

      if (data.booksyBookingId) {
        const [existing] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.clientId, client.id),
              eq(bookings.booksyBookingId, data.booksyBookingId),
            ),
          );
        if (!existing) {
          await db.insert(bookings).values(values);
        }
      } else {
        await db.insert(bookings).values(values);
      }
    } else if (data.type === 'modified' && data.booksyBookingId) {
      const [existing] = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.clientId, client.id),
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
            rawEmailSnippet: rawSnippet,
          })
          .where(eq(bookings.id, existing.id));
      } else {
        await db.insert(bookings).values(buildBookingValues(client.id, data, rawSnippet));
      }
    } else if (data.type === 'cancelled' && data.booksyBookingId) {
      await db
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
        })
        .where(
          and(
            eq(bookings.clientId, client.id),
            eq(bookings.booksyBookingId, data.booksyBookingId),
          ),
        );
    }
  } catch (error) {
    console.error('Error processing inbound email webhook:', error);
  }

  return Response.json({ ok: true });
}
