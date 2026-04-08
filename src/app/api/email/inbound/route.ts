import type { NextRequest } from 'next/server';
import { db } from '@/db';
import { clients, bookings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseBooksyEmail } from '@/lib/booksy-email-parser';

interface PostmarkInboundPayload {
  To?: string;
  OriginalRecipient?: string;
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  MessageID?: string;
}

async function parsePayload(req: NextRequest): Promise<PostmarkInboundPayload | null> {
  const secret = process.env.POSTMARK_INBOUND_SECRET;

  if (secret) {
    let body: string;
    try {
      body = await req.text();
    } catch {
      return null;
    }

    const signature = req.headers.get('x-postmark-signature') ?? '';
    const { createHmac } = await import('crypto');
    const expected = createHmac('sha256', secret).update(body).digest('hex');

    if (signature !== expected) {
      return null; // signal invalid signature
    }

    try {
      return JSON.parse(body) as PostmarkInboundPayload;
    } catch {
      return null;
    }
  }

  // No secret configured — dev mode, parse directly
  try {
    return (await req.json()) as PostmarkInboundPayload;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.POSTMARK_INBOUND_SECRET;

  // Parse and (optionally) verify the payload
  let payload: PostmarkInboundPayload;

  if (secret) {
    let body: string;
    try {
      body = await req.text();
    } catch {
      return Response.json({ ok: true });
    }

    const signature = req.headers.get('x-postmark-signature') ?? '';
    const { createHmac } = await import('crypto');
    const expected = createHmac('sha256', secret).update(body).digest('hex');

    if (signature !== expected) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 });
    }

    try {
      payload = JSON.parse(body) as PostmarkInboundPayload;
    } catch {
      return Response.json({ ok: true });
    }
  } else {
    try {
      payload = (await req.json()) as PostmarkInboundPayload;
    } catch {
      return Response.json({ ok: true });
    }
  }

  try {
    // Extract the To address
    const toField = payload.To ?? payload.OriginalRecipient ?? '';
    const emailMatch = toField.match(/([^<\s]+@[^>\s]+)/);
    const toEmail = emailMatch ? emailMatch[1].replace(/[<>]/g, '').toLowerCase() : '';

    if (!toEmail) return Response.json({ ok: true });

    // Look up client by booksyInboundEmail
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.booksyInboundEmail, toEmail));

    if (!client) {
      console.log('No client found for inbound email:', toEmail);
      return Response.json({ ok: true });
    }

    // Parse the email
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
      const values = {
        clientId: client.id,
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
        // Not found by booking ID — insert as new
        await db.insert(bookings).values({
          clientId: client.id,
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
          booksyBookingId: data.booksyBookingId,
          rawEmailSnippet: rawSnippet,
        });
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

  // Always return 200 — Postmark retries on non-200
  return Response.json({ ok: true });
}
