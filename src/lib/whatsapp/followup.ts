import { db } from '@/db';
import { bookings, clients, conversations, tips } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppMessage } from '@/lib/whatsapp/sender';
import { createTipSession, recordRatingOnly } from '@/lib/tips';
import type { InferSelectModel } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Post-service follow-up (rating + optional tip).
//
// This module owns:
//   1. Outbound: `sendRatingMessage(client, booking)` — called by the cron
//      at endsAt + client.followupMinutesAfter. Sends a single WhatsApp list
//      message with 5 star options, marks `bookings.followupSentAt`, and
//      stores flow state in `conversations.context.followup`.
//
//   2. Inbound routing: the engine calls `isFollowupReplyId()` on every
//      interactive reply. If true, `handleFollowupReply()` takes the turn
//      and the main engine returns early so we don't collide with booking
//      flows.
//
// State (stored inside `conversations.context.followup`):
//   { bookingId, step: 'awaiting_rating' | 'awaiting_tip', tipRowId?, rating? }
//
// When the flow ends (user tipped, skipped, or rated low) we clear the
// followup state so the next WhatsApp message resumes the normal engine.
// -----------------------------------------------------------------------------

type Client = InferSelectModel<typeof clients>;
type Booking = InferSelectModel<typeof bookings>;

// Interactive reply id prefixes — keep these unique across the app so the
// engine can route on prefix alone without false positives.
const PREFIX_RATING = 'fu_rate_'; // fu_rate_1 .. fu_rate_5
const PREFIX_TIP = 'fu_tip_';     // fu_tip_200 .. fu_tip_<cents> | fu_tip_skip
const REPLY_TIP_SKIP = 'fu_tip_skip';

interface FollowupState {
  bookingId: string;
  step: 'awaiting_rating' | 'awaiting_tip';
  rating?: number;
  tipRowId?: string;
}

interface ConversationContext {
  lang?: 'es' | 'en';
  followup?: FollowupState;
  [key: string]: unknown;
}

function readContext(raw: unknown): ConversationContext {
  if (raw && typeof raw === 'object') return raw as ConversationContext;
  return {};
}

async function upsertFollowupState(
  clientId: string,
  customerPhone: string,
  followup: FollowupState | null,
): Promise<void> {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.clientId, clientId),
        eq(conversations.customerPhone, customerPhone),
      ),
    );
  const prevCtx = readContext(conv?.context);
  const nextCtx: ConversationContext = { ...prevCtx };
  if (followup) nextCtx.followup = followup;
  else delete nextCtx.followup;

  if (conv) {
    await db
      .update(conversations)
      .set({ context: nextCtx, lastInteraction: new Date() })
      .where(eq(conversations.id, conv.id));
  } else {
    await db.insert(conversations).values({
      clientId,
      customerPhone,
      step: 'idle',
      context: nextCtx,
    });
  }
}

/**
 * Quick predicate — the engine calls this on every interactive reply id and,
 * if true, delegates to `handleFollowupReply`. Keep it strict so we don't
 * hijack other button ids.
 */
export function isFollowupReplyId(id: string): boolean {
  return id.startsWith(PREFIX_RATING) || id.startsWith(PREFIX_TIP);
}

// -----------------------------------------------------------------------------
// Outbound — send the rating request. Called by the cron.
// -----------------------------------------------------------------------------
export async function sendRatingMessage(
  client: Client,
  booking: Booking,
): Promise<boolean> {
  const token = client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = client.whatsappPhoneNumberId;
  if (!token || !phoneNumberId) {
    console.warn(`[followup] client ${client.id} missing WhatsApp config — skipping`);
    return false;
  }

  const greetingName = booking.customerName?.split(' ')[0] || '';
  const barberClause = booking.barber ? ` con ${booking.barber}` : '';
  const body = greetingName
    ? `Hola ${greetingName} 👋\n¿Qué tal el corte${barberClause}? Tu opinión ayuda mucho.`
    : `Hola 👋\n¿Qué tal el corte${barberClause}? Tu opinión ayuda mucho.`;

  try {
    await sendWhatsAppList(
      phoneNumberId,
      booking.customerPhone,
      body,
      'Valorar',
      [
        {
          title: 'Tu valoración',
          rows: [
            { id: `${PREFIX_RATING}5`, title: '⭐⭐⭐⭐⭐', description: 'Genial' },
            { id: `${PREFIX_RATING}4`, title: '⭐⭐⭐⭐', description: 'Muy bueno' },
            { id: `${PREFIX_RATING}3`, title: '⭐⭐⭐', description: 'Bien' },
            { id: `${PREFIX_RATING}2`, title: '⭐⭐', description: 'Regular' },
            { id: `${PREFIX_RATING}1`, title: '⭐', description: 'Mal' },
          ],
        },
      ],
      token,
    );

    await db
      .update(bookings)
      .set({ followupSentAt: new Date() })
      .where(eq(bookings.id, booking.id));

    await upsertFollowupState(client.id, booking.customerPhone, {
      bookingId: booking.id,
      step: 'awaiting_rating',
    });

    return true;
  } catch (err) {
    console.error(`[followup] send failed for booking ${booking.id}:`, err);
    return false;
  }
}

// -----------------------------------------------------------------------------
// Inbound — router for interactive replies that start with our prefixes.
// Returns true if it owned the reply (caller should stop processing).
//
// Accepts either a full client row (callers that already have one) or just
// the clientId (e.g. the engine, which carries a narrower `BarbershopConfig`).
// -----------------------------------------------------------------------------
export async function handleFollowupReply(
  clientRef: Client | { id: string },
  customerPhone: string,
  replyId: string,
): Promise<boolean> {
  if (!isFollowupReplyId(replyId)) return false;

  // Resolve full client row so we have Connect / tips config fields.
  const client: Client =
    'email' in clientRef
      ? (clientRef as Client)
      : (await db.select().from(clients).where(eq(clients.id, clientRef.id)))[0];
  if (!client) return false;

  // Load current followup state; if there isn't any, the user is tapping a
  // stale button — acknowledge politely and exit without side effects.
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.clientId, client.id),
        eq(conversations.customerPhone, customerPhone),
      ),
    );
  const ctx = readContext(conv?.context);
  const state = ctx.followup;

  const token = client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = client.whatsappPhoneNumberId;

  if (!state || !phoneNumberId || !token) {
    // Stale or misconfigured — silently own the id so it doesn't poison the
    // main engine state, but don't fail loudly to the user.
    return true;
  }

  // ── Rating step ──────────────────────────────────────────────────────────
  if (replyId.startsWith(PREFIX_RATING)) {
    const raw = replyId.slice(PREFIX_RATING.length);
    const rating = Number.parseInt(raw, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return true;

    const [bookingRow] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, state.bookingId));

    // Always persist the rating (as rating_only — the tip may or may not
    // happen next). We write the row NOW even before the tip so the data
    // survives if the user abandons the flow.
    const tipRowId = await recordRatingOnly({
      clientId: client.id,
      bookingId: state.bookingId,
      customerPhone,
      barberName: bookingRow?.barber ?? null,
      rating,
    });

    // Low rating path: don't ask for a tip. Surface to Alex so he can ping
    // the barbershop.
    if (rating <= 3) {
      await sendWhatsAppMessage(
        phoneNumberId,
        customerPhone,
        '¡Gracias por tu opinión! Se la pasamos al equipo para mejorar.',
        token,
      );
      await upsertFollowupState(client.id, customerPhone, null);
      return true;
    }

    // High rating → propose a tip. 3-button limit means we pick the first
    // three suggested amounts; remaining stay hidden (a "Otro" custom input
    // is not worth building for MVP).
    const suggested = (client.tipsSuggestedCents || [200, 300, 500])
      .filter((n) => Number.isInteger(n) && n >= 100)
      .slice(0, 2); // 2 amounts + "No gracias" = 3 buttons total (Meta max)

    if (!client.tipsEnabled || !client.stripeConnectAccountId || suggested.length === 0) {
      // Tips disabled or Connect not ready — thank and exit without offering
      // a tip we can't actually collect.
      await sendWhatsAppMessage(
        phoneNumberId,
        customerPhone,
        '¡Gracias por tu valoración! 🙌',
        token,
      );
      await upsertFollowupState(client.id, customerPhone, null);
      return true;
    }

    const barberClause = bookingRow?.barber ? ` a ${bookingRow.barber}` : '';
    await sendWhatsAppButtons(
      phoneNumberId,
      customerPhone,
      `¡Me alegro! ¿Quieres dejar propina${barberClause}?`,
      [
        ...suggested.map((cents) => ({
          id: `${PREFIX_TIP}${cents}`,
          title: `${(cents / 100).toFixed(0)} €`,
        })),
        { id: REPLY_TIP_SKIP, title: 'No, gracias' },
      ],
      token,
    );

    await upsertFollowupState(client.id, customerPhone, {
      bookingId: state.bookingId,
      step: 'awaiting_tip',
      rating,
      tipRowId,
    });
    return true;
  }

  // ── Tip step ─────────────────────────────────────────────────────────────
  if (replyId === REPLY_TIP_SKIP) {
    await sendWhatsAppMessage(
      phoneNumberId,
      customerPhone,
      '¡Gracias de todas formas! Nos vemos pronto. 💈',
      token,
    );
    await upsertFollowupState(client.id, customerPhone, null);
    return true;
  }

  if (replyId.startsWith(PREFIX_TIP)) {
    const raw = replyId.slice(PREFIX_TIP.length);
    const amountCents = Number.parseInt(raw, 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) return true;

    const [bookingRow] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, state.bookingId));

    try {
      const { url, tipId } = await createTipSession({
        client,
        bookingId: state.bookingId,
        customerPhone,
        barberName: bookingRow?.barber ?? null,
        amountCents,
        rating: state.rating ?? null,
      });

      // Link the rating row (rating_only) to the new paid tip by flagging
      // the old one as superseded. Cleanest is to just carry the rating on
      // the new row via `createTipSession` (we already pass rating) and
      // delete the placeholder.
      if (state.tipRowId) {
        await db.delete(tips).where(eq(tips.id, state.tipRowId));
      }

      await sendWhatsAppMessage(
        phoneNumberId,
        customerPhone,
        `¡Genial! Paga tu propina de ${(amountCents / 100).toFixed(0)} € aquí:\n${url}\n\n(El enlace expira en 24h.)`,
        token,
      );

      // Clear followup state — the Stripe webhook owns the rest.
      await upsertFollowupState(client.id, customerPhone, null);
      void tipId; // kept so callers of this function can debug; not returned
      return true;
    } catch (err) {
      console.error(`[followup] createTipSession failed:`, err);
      await sendWhatsAppMessage(
        phoneNumberId,
        customerPhone,
        'Ha habido un problema generando el pago. Puedes dar la propina en efectivo la próxima vez 💈',
        token,
      );
      await upsertFollowupState(client.id, customerPhone, null);
      return true;
    }
  }

  return true;
}

