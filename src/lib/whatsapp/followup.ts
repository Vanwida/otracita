import { db } from '@/db';
import { bookings, clients, conversations } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendWhatsAppButtons, sendWhatsAppList, sendWhatsAppMessage } from '@/lib/whatsapp/sender';
import { createTipSession, recordRating } from '@/lib/tips';
import { dispatchUserNotification } from '@/lib/notifications/dispatch';
import { canonicalPhone } from '@/lib/phone';
import { publicRatePath } from '@/lib/site';
import type { InferSelectModel } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Post-service follow-up (rating + optional tip).
//
// This module owns:
//   1. Outbound: `sendRatingFollowup(client, booking)` — disparado al
//      transicionar el booking a `completed` (manual desde dashboard, o
//      por el sweep diario del cron de reminders pasados 3 días). El
//      helper `tryRatingFollowupForCompletedBooking(bookingId)` es el
//      entry point fire-and-forget que usan los call-sites.
//      Manda push si hay PWA, fallback a WhatsApp con 5 estrellas.
//      Marca `bookings.followupSentAt` para idempotencia.
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
}

// -----------------------------------------------------------------------------
// Anti-fraude: el barbero no puede pedir reseñas a sus propios números (las
// reservas que él se crea para testear, números del propio negocio, etc.).
// Comparamos por dígitos puros para tolerar formatos distintos (+34, 0034,
// con espacios, etc.).
// -----------------------------------------------------------------------------

function digitsOnly(p: string | null | undefined): string {
  return (p ?? '').replace(/\D/g, '');
}

function isOwnBusinessPhone(customerPhone: string, client: Client): boolean {
  const target = digitsOnly(customerPhone);
  if (!target) return false;
  for (const p of [client.phone, client.whatsappNumber]) {
    const own = digitsOnly(p);
    if (own && (own === target || own.endsWith(target) || target.endsWith(own))) {
      return true;
    }
  }
  return false;
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
// Outbound — manda la solicitud de reseña usando el dispatcher unificado:
//
//   1. Si el cliente tiene la PWA instalada con push activo → push con
//      deep-link a /b/<slug>/cuenta/rate/<bookingId>. UX nativa con
//      estrellas táctiles + comentario opcional + propina inline si aplica.
//   2. Si no → fallback a WhatsApp interactive list (las 5 estrellas como
//      filas tappables) — la conversación arranca el state machine viejo
//      via upsertFollowupState.
//
// Anti-fraude: si el customerPhone coincide con un número del propio
// negocio (test bookings autocreados por el barbero), se omite el envío.
//
// Marcamos `bookings.followupSentAt` SOLO si el dispatcher entregó por
// algún canal — si fue 'none' (ni PWA ni WhatsApp configurados) no
// quemamos el slot, el cron lo reintentará en el próximo barrido.
// -----------------------------------------------------------------------------
export async function sendRatingFollowup(
  client: Client,
  booking: Booking,
): Promise<'push' | 'whatsapp' | 'none'> {
  if (isOwnBusinessPhone(booking.customerPhone, client)) {
    console.log(`[followup] skipping booking ${booking.id} — own business phone`);
    return 'none';
  }

  const token = client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = client.whatsappPhoneNumberId;

  const greetingName = booking.customerName?.split(' ')[0] || '';
  const barberClause = booking.barber ? ` con ${booking.barber}` : '';
  const whatsappBody = greetingName
    ? `Hola ${greetingName} 👋\n¿Qué tal el corte${barberClause}? Tu opinión ayuda mucho.`
    : `Hola 👋\n¿Qué tal el corte${barberClause}? Tu opinión ayuda mucho.`;

  // Push payload — el deep link aterriza en la página PWA de rating.
  // Si el cliente no tiene publicSlug (raro pero posible), nos vamos
  // directo al fallback de WhatsApp.
  if (!client.publicSlug) {
    return sendRatingWhatsApp(client, booking, whatsappBody, token, phoneNumberId);
  }

  const ratePath = publicRatePath(client.publicSlug, booking.id);
  let dispatched: 'push' | 'whatsapp' | 'none' = 'none';

  try {
    const result = await dispatchUserNotification({
      phone: booking.customerPhone,
      clientId: client.id,
      push: {
        title: `¿Qué tal en ${client.businessName}?`,
        body: `Toca para valorar tu visita${barberClause}.`,
        url: ratePath,
        tag: `rate-${booking.id}`,
        data: { kind: 'rating_request', bookingId: booking.id },
      },
      whatsappFallback: token && phoneNumberId
        ? async () => {
            await sendRatingWhatsAppList(
              phoneNumberId,
              booking.customerPhone,
              whatsappBody,
              token,
            );
            await upsertFollowupState(client.id, booking.customerPhone, {
              bookingId: booking.id,
              step: 'awaiting_rating',
            });
          }
        : undefined,
    });
    dispatched = result.channel;
  } catch (err) {
    console.error(`[followup] dispatch failed for booking ${booking.id}:`, err);
    return 'none';
  }

  if (dispatched === 'none') return 'none';

  await db
    .update(bookings)
    .set({ followupSentAt: new Date() })
    .where(eq(bookings.id, booking.id));

  return dispatched;
}

/**
 * Fire-and-forget helper para disparar la solicitud de reseña tras
 * marcar una cita como `completed`. Nunca lanza, idempotente.
 *
 * Caller la invoca en transiciones a completed:
 *   1. PATCH /api/bookings/[id] cuando el barbero pulsa "Marcar completada"
 *   2. cron/reminders lifecycle sweep cuando auto-cierra una cita olvidada
 *
 * Reglas:
 *   - Si `client.ratingsEnabled === false` → no-op silencioso
 *   - Si la cita ya tiene `followupSentAt` → no-op (idempotencia)
 *   - Si la cita es cancelled/no_show → no-op (sendRatingFollowup ya lo
 *     filtra pero blindamos antes para evitar la query)
 */
export function tryRatingFollowupForCompletedBooking(bookingId: string): void {
  void (async () => {
    try {
      const [row] = await db
        .select({ booking: bookings, client: clients })
        .from(bookings)
        .innerJoin(clients, eq(bookings.clientId, clients.id))
        .where(eq(bookings.id, bookingId));
      if (!row) return;
      if (!row.client.ratingsEnabled) return;
      if (row.booking.followupSentAt) return;
      if (row.booking.status === 'cancelled' || row.booking.status === 'no_show') return;

      // Walk-in guard — bookings creados sin teléfono (cliente que entra a la
      // barbería sin reserva previa) no tienen canal donde mandar el followup.
      // dispatchUserNotification devolvería 'none' y como no marcamos
      // followupSentAt, el cron safety-net del día siguiente lo recogería
      // otra vez en bucle. Salida silenciosa para cortar el loop sin falsear
      // que sí se envió.
      if (!row.booking.customerPhone || row.booking.customerPhone.trim() === '') {
        console.info('[followup] skipped — walk-in sin teléfono', { bookingId });
        return;
      }

      const channel = await sendRatingFollowup(row.client, row.booking);

      console.info('[followup]', {
        booking: bookingId,
        channel,
        tipsEnabled: Boolean(row.client.tipsEnabled),
        hasConnect: Boolean(row.client.stripeConnectAccountId),
      });
    } catch (err) {
      console.error('[followup] tryRatingFollowupForCompletedBooking failed:', bookingId, err);
    }
  })();
}

/**
 * Fallback puro a WhatsApp cuando no hay slug público (sin PWA posible).
 * Encapsula la lógica de envío + state para reusarla.
 */
async function sendRatingWhatsApp(
  client: Client,
  booking: Booking,
  body: string,
  token: string,
  phoneNumberId: string | null,
): Promise<'push' | 'whatsapp' | 'none'> {
  if (!token || !phoneNumberId) {
    console.warn(`[followup] client ${client.id} missing WhatsApp config — skipping`);
    return 'none';
  }
  try {
    await sendRatingWhatsAppList(phoneNumberId, booking.customerPhone, body, token);
    await db
      .update(bookings)
      .set({ followupSentAt: new Date() })
      .where(eq(bookings.id, booking.id));
    await upsertFollowupState(client.id, booking.customerPhone, {
      bookingId: booking.id,
      step: 'awaiting_rating',
    });
    return 'whatsapp';
  } catch (err) {
    console.error(`[followup] whatsapp send failed for booking ${booking.id}:`, err);
    return 'none';
  }
}

/**
 * Mensaje WhatsApp con lista interactiva de 5 estrellas. Idéntico al que
 * existía antes — extraído a función propia para que tanto el path normal
 * como el fallback lo usen sin duplicar el array de filas.
 */
async function sendRatingWhatsAppList(
  phoneNumberId: string,
  to: string,
  body: string,
  token: string,
): Promise<void> {
  await sendWhatsAppList(
    phoneNumberId,
    to,
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
  customerPhoneRaw: string,
  replyId: string,
): Promise<boolean> {
  if (!isFollowupReplyId(replyId)) return false;

  // Canonicalize so the conversation / ratings / followup-state lookups key
  // off the SAME E.164 value that bookings + customers store. The engine
  // already canonicalizes msg.from before calling us; doing it again is
  // idempotent and makes this entry point correct on its own (defensive —
  // it guarantees no raw-format identity match path through followup).
  const customerPhone = canonicalPhone(customerPhoneRaw);

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

    // Persistimos la valoración en la tabla canónica `ratings` ANTES de
    // ofrecer la propina. Si el cliente abandona el flow, la valoración
    // ya está guardada. La idempotencia del UNIQUE parcial impide
    // sobrescribir si por algún caso de carrera ya existía.
    await recordRating({
      clientId: client.id,
      bookingId: state.bookingId,
      customerPhone,
      customerName: bookingRow?.customerName ?? null,
      barberName: bookingRow?.barber ?? null,
      rating,
      channel: 'whatsapp',
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
      // Tips disabled or Connect not ready — thank + (si configurado) invitar
      // a dejar reseña en Google. Solo en 5★ (rating >=4 ya filtra esto arriba)
      // porque un 4★ puede esconder feedback crítico — no queremos amplificar
      // tibias en Google.
      const base = '¡Gracias por tu valoración! 🙌';
      const withReview =
        rating === 5 && client.googleReviewUrl
          ? `${base}\n\n¿Nos dejas una reseña? Ayuda mucho:\n${client.googleReviewUrl}`
          : base;
      await sendWhatsAppMessage(phoneNumberId, customerPhone, withReview, token);
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

      // Antes borrábamos un "tip placeholder" (la fila tips status=rating_only).
      // Con la tabla `ratings` separada ya no existe ese placeholder — la
      // valoración vive independiente. La fila `tips` que se acaba de crear
      // representa solo el cobro, sin acoplamiento.

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

