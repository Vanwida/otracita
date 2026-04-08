import { db } from '@/db';
import { bookings } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';

export interface TimeSlot {
  start: string; // HH:MM
  end: string;   // HH:MM
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function getAvailableSlotsFromDB(
  clientId: string,
  date: string,
  serviceDuration: number,
  businessHours: { start: string; end: string },
  barberName?: string,
  blockedDates?: string[]
): Promise<TimeSlot[]> {
  // 1. Return empty if date is blocked
  if (blockedDates?.includes(date)) return [];

  // 2. Query confirmed bookings for this client on this date
  const filters = [
    eq(bookings.clientId, clientId),
    eq(bookings.date, date),
    eq(bookings.status, 'confirmed'),
  ];

  const rows = await db
    .select()
    .from(bookings)
    .where(and(...filters));

  // If a specific barber was requested (not "Sin preferencia"), filter by that barber.
  // Otherwise, all confirmed bookings on this date block slots.
  const relevantRows = barberName && barberName !== 'Sin preferencia'
    ? rows.filter(r => r.barber === barberName)
    : rows;

  // 3. Convert booking rows to busy periods in minutes-since-midnight
  const busyPeriods = relevantRows.map(r => {
    const startMin = parseMinutes(r.time);
    const endMin = startMin + r.duration;
    return { startMin, endMin };
  });

  // 4. Parse business hours to minutes
  const bhStart = parseMinutes(businessHours.start);
  const bhEnd = parseMinutes(businessHours.end);

  // 5. Generate slots using serviceDuration as the step interval
  const availableSlots: TimeSlot[] = [];

  for (let slotStart = bhStart; slotStart + serviceDuration <= bhEnd; slotStart += serviceDuration) {
    const slotEnd = slotStart + serviceDuration;

    const isBlocked = busyPeriods.some(
      busy => slotStart < busy.endMin && slotEnd > busy.startMin
    );

    if (!isBlocked) {
      availableSlots.push({
        start: formatMinutes(slotStart),
        end: formatMinutes(slotEnd),
      });
    }
  }

  // 7. For same-day bookings, filter out past/too-soon slots using Europe/Madrid time
  const now = new Date();
  const todayMadrid = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  if (date !== todayMadrid) return availableSlots;

  const nowMadrid = now.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [nowH, nowM] = nowMadrid.split(':').map(Number);
  const cutoffMinutes = nowH * 60 + nowM + serviceDuration;
  return availableSlots.filter(s => {
    const [h, m] = s.start.split(':').map(Number);
    return h * 60 + m >= cutoffMinutes;
  });
}
