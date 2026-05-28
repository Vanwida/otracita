import { db } from '@/db';
import { bookings, clients, conversations, customers } from '@/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { sendWhatsAppButtons } from '@/lib/whatsapp/sender';
import { formatDateSpanish } from '@/lib/google-calendar';
import { requireCron } from '@/lib/auth/require-cron';
import { dispatchUserNotification } from '@/lib/notifications/dispatch';
import { tryRatingFollowupForCompletedBooking } from '@/lib/whatsapp/followup';
import { MS_IN_DAY, BUSINESS_TIMEZONE } from '@/lib/time';
import { publicAccountPath } from '@/lib/site';
import { logBookingEvent } from '@/lib/bookings/events';

type Lang = 'es' | 'en';

export async function GET(request: Request) {
  const unauth = requireCron(request);
  if (unauth) return unauth;

  // Get tomorrow's date in Spain timezone
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });

  // Find confirmed bookings for tomorrow that haven't been reminded
  const upcomingBookings = await db
    .select({
      booking: bookings,
      client: clients,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        eq(bookings.date, tomorrowStr),
        eq(bookings.status, 'confirmed'),
        eq(bookings.reminderSent, false)
      )
    );

  let sent = 0;
  for (const { booking, client } of upcomingBookings) {
    const token = client.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneNumberId = client.whatsappPhoneNumberId;

    if (!token || !phoneNumberId) continue;

    // Retrieve stored language preference from conversation context
    const [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.clientId, client.id),
          eq(conversations.customerPhone, booking.customerPhone)
        )
      );
    const storedCtx = (conv?.context as { lang?: Lang } | null) ?? null;
    const lang: Lang = storedCtx?.lang ?? 'es';

    const name = booking.customerName || '';
    const barberText = booking.barber
      ? (lang === 'en' ? ` with ${booking.barber}` : ` con ${booking.barber}`)
      : '';

    let messageBody: string;
    if (lang === 'en') {
      const greeting = name ? `Hey ${name}! ` : '';
      messageBody = `${greeting}📅 Just a reminder about your appointment tomorrow:\n\n${booking.service}${barberText}\n${formatDateSpanish(booking.date)} at ${booking.time}\n${client.address ? `📍 ${client.address}` : ''}\n\nCan you confirm you'll be there?`;
    } else {
      const greeting = name ? `Hola ${name}! ` : '';
      messageBody = `${greeting}📅 Te recordamos tu cita de mañana:\n\n${booking.service}${barberText}\n${formatDateSpanish(booking.date)} a las ${booking.time}\n${client.address ? `📍 ${client.address}` : ''}\n\n¿Confirmas tu asistencia?`;
    }

    try {
      // One channel only — push if the customer has the PWA, WhatsApp
      // otherwise. Avoids paying for a template + vibrating the phone twice.
      // The WhatsApp message keeps the interactive Confirm/Cancel buttons
      // because that's the canonical reply path the engine listens to.
      const dispatch = await dispatchUserNotification({
        phone: booking.customerPhone,
        clientId: client.id,
        push: {
          title: `Mañana tu cita en ${client.businessName}`,
          body: `${booking.service}${booking.barber ? ` con ${booking.barber}` : ''} · ${formatDateSpanish(booking.date)} a las ${booking.time}`,
          url: client.publicSlug ? publicAccountPath(client.publicSlug) : '/',
          tag: `reminder-${booking.id}`,
          data: { bookingId: booking.id, kind: 'reminder_24h' },
        },
        whatsappFallback: async () => {
          const r = await sendWhatsAppButtons(
            phoneNumberId,
            booking.customerPhone,
            messageBody,
            [
              { id: 'reminder_confirm', title: lang === 'en' ? "✅ I'll be there" : '✅ Confirmo' },
              { id: 'reminder_cancel', title: lang === 'en' ? '❌ Cancel' : '❌ Cancelar' },
            ],
            token,
          );
          // Meta rechaza freeform fuera de la ventana de 24h (error 131047).
          // Señalamos el fallo para NO marcar el recordatorio como enviado.
          if (r?.error) {
            console.warn(`[cron/reminders] Meta rechazó recordatorio booking ${booking.id}:`, r.error);
            return false;
          }
          return true;
        },
      });

      // Solo marcamos `reminderSent` si el envío llegó al cliente:
      //   · push entregado (channel='push' ⇒ pushSent > 0 garantizado por dispatch)
      //   · whatsapp aceptado por Meta (whatsappOk !== false)
      // Si Meta rechazó (ventana 24h cerrada), NO marcamos → el cron
      // reintentará en la siguiente pasada y el fallo queda visible en logs,
      // en vez de un recordatorio fantasma + posible no-show.
      const delivered =
        dispatch.channel === 'push' ||
        (dispatch.channel === 'whatsapp' && dispatch.whatsappOk !== false);

      if (!delivered) {
        console.warn(`[cron/reminders] no se entregó recordatorio booking ${booking.id} (channel=${dispatch.channel}); reintentará`);
        continue;
      }

      // Mark as reminded — only once delivery succeeded.
      await db.update(bookings)
        .set({ reminderSent: true })
        .where(eq(bookings.id, booking.id));

      // Log de evento (task #107). Actor = sistema (lo dispara el cron).
      await logBookingEvent({
        clientId: client.id,
        bookingId: booking.id,
        type: 'reminder_sent',
        actor: 'system',
        actorLabel: 'Recordatorio automático',
        summary: 'Recordatorio de cita enviado (24h antes)',
        metadata: { date: booking.date, time: booking.time },
      });

      sent++;
    } catch (error) {
      console.error(`Reminder failed for booking ${booking.id}:`, error);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Lifecycle safety net — bookings olvidados sin cerrar pasados 3 días.
  //
  // El flujo principal de cierre es manual: el barbero marca completed
  // desde /dashboard (panel "Citas por cerrar") o desde el detalle de la
  // cita en agenda. Este cron es solo red de seguridad para cuando se
  // olvidan — pasados 3 días asumimos que la cita se completó (si fue
  // no-show debería haberse marcado a tiempo).
  //
  // Margen de 3 días (no 1) → el barbero tiene tiempo real de cerrar
  // manualmente desde Inicio sin que el sistema le haga el trabajo
  // silenciosamente.
  //
  // Acciones por cada booking que cerramos:
  //   1. UPDATE bookings.status = 'completed'
  //   2. Decrementar noShows del customer (min 0) — recompensa por
  //      cliente fiable que no falló esta cita
  //
  // La cita queda como TICKET interno (cuenta para caja/ingresos/BI). NO
  // se factura a Hacienda: facturar VeriFactu es una acción explícita del
  // barbero (POST /api/invoices/from-booking) — el cron jamás declara por
  // él. `autoInvoiced` se mantiene en la respuesta (siempre 0) para no
  // romper el contrato del cron / monitorización existente.
  // ────────────────────────────────────────────────────────────────────────
  const SAFETY_NET_DAYS = 3;
  const safetyCutoff = new Date(Date.now() - SAFETY_NET_DAYS * MS_IN_DAY)
    .toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });

  let completedCount = 0;
  let decrementedCount = 0;
  // Siempre 0 desde que la facturación dejó de ser automática. Se mantiene
  // en la respuesta para no romper el contrato del cron / monitorización.
  const autoInvoicedCount = 0;
  try {
    const toClose = await db
      .select({
        id: bookings.id,
        clientId: bookings.clientId,
        customerPhone: bookings.customerPhone,
      })
      .from(bookings)
      .where(and(lt(bookings.date, safetyCutoff), eq(bookings.status, 'confirmed')));

    // (Antes había un cache de invoicingEnabled para auto-facturar al
    // cerrar por sweep. Eliminado: la facturación ya no es automática.)

    for (const row of toClose) {
      await db
        .update(bookings)
        .set({ status: 'completed' })
        .where(eq(bookings.id, row.id));
      completedCount++;

      // Log de evento (task #107): cierre automático por red de seguridad.
      // Actor = sistema; deja claro en el timeline que NO lo cerró un humano.
      await logBookingEvent({
        clientId: row.clientId,
        bookingId: row.id,
        type: 'completed',
        actor: 'system',
        actorLabel: 'Cierre automático',
        summary: `Completada automáticamente (sin cerrar tras ${SAFETY_NET_DAYS} días)`,
      });

      // Decrement that customer's noShows counter (min 0).
      const upd = await db
        .update(customers)
        .set({ noShows: sql`GREATEST(${customers.noShows} - 1, 0)` })
        .where(
          and(
            eq(customers.clientId, row.clientId),
            eq(customers.phone, row.customerPhone),
          ),
        )
        .returning({ id: customers.id });
      if (upd.length > 0) decrementedCount++;

      // Facturación VeriFactu: NUNCA automática (decisión de producto).
      // El sweep cierra la cita olvidada y la deja como TICKET interno
      // (cuenta para caja/ingresos/BI). Declararla a Hacienda es una
      // acción explícita del barbero — el cron jamás factura por él.
      // isInvoicingEnabled ya no se usa aquí; se mantiene la variable de
      // conteo a 0 para no romper el shape de la respuesta del cron.

      // Push solicitud de reseña — el helper internamente comprueba
      // ratingsEnabled e idempotencia (followupSentAt). El cron viejo
      // dedicado de post-booking-followup queda eliminado: la review se
      // dispara cuando la cita pasa a 'completed', sea manual o por sweep.
      tryRatingFollowupForCompletedBooking(row.id);
    }
  } catch (err) {
    console.error('[cron/reminders] lifecycle sweep failed:', err);
  }

  return Response.json({
    success: true,
    remindersSent: sent,
    date: tomorrowStr,
    bookingsCompleted: completedCount,
    noShowsDecremented: decrementedCount,
    autoInvoiced: autoInvoicedCount,
    safetyNetDays: SAFETY_NET_DAYS,
  });
}
