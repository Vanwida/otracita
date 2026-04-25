import { db } from '@/db';
import { bookings, clients, conversations, customers } from '@/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { sendWhatsAppButtons } from '@/lib/whatsapp/sender';
import { formatDateSpanish } from '@/lib/google-calendar';
import { requireCron } from '@/lib/auth/require-cron';
import { dispatchUserNotification } from '@/lib/notifications/dispatch';

type Lang = 'es' | 'en';

export async function GET(request: Request) {
  const unauth = requireCron(request);
  if (unauth) return unauth;

  // Get tomorrow's date in Spain timezone
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

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
      await dispatchUserNotification({
        phone: booking.customerPhone,
        clientId: client.id,
        push: {
          title: `Mañana tu cita en ${client.businessName}`,
          body: `${booking.service}${booking.barber ? ` con ${booking.barber}` : ''} · ${formatDateSpanish(booking.date)} a las ${booking.time}`,
          url: client.publicSlug ? `/b/${client.publicSlug}/cuenta` : '/',
          tag: `reminder-${booking.id}`,
          data: { bookingId: booking.id, kind: 'reminder_24h' },
        },
        whatsappFallback: async () => {
          await sendWhatsAppButtons(
            phoneNumberId,
            booking.customerPhone,
            messageBody,
            [
              { id: 'reminder_confirm', title: lang === 'en' ? "✅ I'll be there" : '✅ Confirmo' },
              { id: 'reminder_cancel', title: lang === 'en' ? '❌ Cancel' : '❌ Cancelar' },
            ],
            token,
          );
        },
      });

      // Mark as reminded — regardless of channel.
      await db.update(bookings)
        .set({ reminderSent: true })
        .where(eq(bookings.id, booking.id));

      sent++;
    } catch (error) {
      console.error(`Reminder failed for booking ${booking.id}:`, error);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Daily lifecycle sweep — mark yesterday's confirmed bookings as
  // `completed` and decrement the customer's no-show counter by 1 (floor 0).
  // This is how we reward reliable clients: after each successful visit
  // their no-show history decays naturally without the barber doing
  // anything manual. "Perdonar" (noShows -> 0) is still available in the UI
  // for one-shot forgiveness.
  //
  // Rule: any booking with date < today AND status = 'confirmed' is
  // assumed completed. If the customer actually didn't show, the barber
  // should have marked it no-show beforehand — the BookingDetailPanel has
  // that button. We don't try to guess past the 24h mark.
  // ────────────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  let completedCount = 0;
  let decrementedCount = 0;
  try {
    const toClose = await db
      .select({ id: bookings.id, clientId: bookings.clientId, customerPhone: bookings.customerPhone })
      .from(bookings)
      .where(and(lt(bookings.date, today), eq(bookings.status, 'confirmed')));

    for (const row of toClose) {
      await db
        .update(bookings)
        .set({ status: 'completed' })
        .where(eq(bookings.id, row.id));
      completedCount++;

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
  });
}
