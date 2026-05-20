import { google } from 'googleapis';
import { MS_IN_MINUTE, BUSINESS_TIMEZONE } from '@/lib/time';

// ---------------------------------------------------------------------------
// Google Calendar client (service account)
// ---------------------------------------------------------------------------

function getCalendarClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeSlot {
  start: string; // "17:00"
  end: string;   // "17:30"
  available: boolean;
}

// ---------------------------------------------------------------------------
// Get available time slots
// ---------------------------------------------------------------------------

/**
 * Get available time slots for a given day and calendar.
 * @param calendarId - The Google Calendar ID
 * @param date - The date to check (YYYY-MM-DD format)
 * @param serviceDuration - Duration in minutes
 * @param businessHours - { start: "10:00", end: "20:00" }
 */
export async function getAvailableSlots(
  calendarId: string,
  date: string,
  serviceDuration: number = 30,
  businessHours: { start: string; end: string } = { start: '10:00', end: '20:00' },
  barberName?: string,
  blockedDates?: string[]
): Promise<TimeSlot[]> {
  if (blockedDates?.includes(date)) return [];

  const calendar = getCalendarClient();

  // Build timezone-aware boundaries for the day
  const timeMin = new Date(`${date}T${businessHours.start}:00+02:00`);
  const timeMax = new Date(`${date}T${businessHours.end}:00+02:00`);

  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  // Filter events by barber name if provided
  // Events are titled like "Corte Premium - Daniel - +34644288663"
  const relevantEvents = barberName && barberName !== 'Sin preferencia'
    ? events.filter(e => e.summary?.toLowerCase().includes(barberName.toLowerCase()))
    : events; // No barber filter = check ALL events (any barber busy = slot busy)

  // Busy periods from relevant events
  const busyTimes = relevantEvents.map(event => ({
    start: new Date(event.start?.dateTime || event.start?.date || ''),
    end: new Date(event.end?.dateTime || event.end?.date || ''),
  }));

  // Generate every possible slot within business hours
  const slots: TimeSlot[] = [];
  let current = new Date(timeMin);

  while (current < timeMax) {
    const slotEnd = new Date(current.getTime() + serviceDuration * MS_IN_MINUTE);
    if (slotEnd > timeMax) break;

    const isAvailable = !busyTimes.some(
      busy => current < busy.end && slotEnd > busy.start
    );

    const startHour = current.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: BUSINESS_TIMEZONE,
    });
    const endHour = slotEnd.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: BUSINESS_TIMEZONE,
    });

    slots.push({ start: startHour, end: endHour, available: isAvailable });

    // Advance in 30-min increments
    current = new Date(current.getTime() + 30 * MS_IN_MINUTE);
  }

  const now = new Date();
  const todayMadrid = now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
  const isToday = date === todayMadrid;

  if (!isToday) return slots.filter(s => s.available);

  // Get current time as HH:MM in Madrid timezone (server runs UTC)
  const nowMadrid = now.toLocaleTimeString('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }); // e.g. "17:17"

  // Add 30 min buffer
  const [nowH, nowM] = nowMadrid.split(':').map(Number);
  const cutoffMinutes = nowH * 60 + nowM + 30;
  const cutoff = `${String(Math.floor(cutoffMinutes / 60)).padStart(2, '0')}:${String(cutoffMinutes % 60).padStart(2, '0')}`;

  return slots.filter(s => s.available && s.start >= cutoff);
}

// ---------------------------------------------------------------------------
// Create a booking event
// ---------------------------------------------------------------------------

export async function createBooking(
  calendarId: string,
  date: string,
  time: string, // "17:00"
  serviceName: string,
  serviceDuration: number,
  customerName: string,
  customerPhone: string,
  barberName?: string
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const calendar = getCalendarClient();

    const startDateTime = new Date(`${date}T${time}:00+02:00`);
    const endDateTime = new Date(startDateTime.getTime() + serviceDuration * MS_IN_MINUTE);

    const titleParts = [serviceName];
    if (barberName && barberName !== 'Sin preferencia') titleParts.push(barberName);
    titleParts.push(customerPhone);

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: titleParts.join(' - '),
        description: [
          'Reserva via otracita',
          `Cliente: ${customerName}`,
          `Telefono: ${customerPhone}`,
          `Servicio: ${serviceName}`,
          barberName ? `Barbero: ${barberName}` : '',
        ].filter(Boolean).join('\n'),
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: BUSINESS_TIMEZONE,
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: BUSINESS_TIMEZONE,
        },
        colorId: '2', // Green
      },
    });

    return { success: true, eventId: event.data.id || undefined };
  } catch (error) {
    console.error('Calendar booking error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ---------------------------------------------------------------------------
// Delete a calendar event
// ---------------------------------------------------------------------------

export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({ calendarId, eventId });
    return true;
  } catch (error) {
    console.error('Calendar delete error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Date helpers (Spain timezone)
// ---------------------------------------------------------------------------

/** Today in YYYY-MM-DD (Europe/Madrid) */
export function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

/** Tomorrow in YYYY-MM-DD (Europe/Madrid) */
export function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
}

/** Format a date for display: "Lunes 3 de abril" */
export function formatDateSpanish(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00+02:00`);
  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: BUSINESS_TIMEZONE,
  });
}
