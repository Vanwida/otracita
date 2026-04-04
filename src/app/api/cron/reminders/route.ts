import { db } from '@/db';
import { bookings, clients, conversations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendWhatsAppButtons } from '@/lib/whatsapp/sender';
import { formatDateSpanish } from '@/lib/google-calendar';

type Lang = 'es' | 'en';

export async function GET(request: Request) {
  // Simple auth check
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET && secret !== 'agendalo-cron-2024') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
      await sendWhatsAppButtons(
        phoneNumberId,
        booking.customerPhone,
        messageBody,
        [
          { id: 'reminder_confirm', title: lang === 'en' ? "✅ I'll be there" : '✅ Confirmo' },
          { id: 'reminder_cancel', title: lang === 'en' ? '❌ Cancel' : '❌ Cancelar' },
        ],
        token
      );

      // Mark as reminded
      await db.update(bookings)
        .set({ reminderSent: true })
        .where(eq(bookings.id, booking.id));

      sent++;
    } catch (error) {
      console.error(`Reminder failed for booking ${booking.id}:`, error);
    }
  }

  return Response.json({ success: true, remindersSent: sent, date: tomorrowStr });
}
