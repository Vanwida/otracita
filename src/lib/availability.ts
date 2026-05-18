import { db } from '@/db';
import { bookings } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import type { BarberConfig } from '@/lib/whatsapp/config';
import { unavailabilityFor, unavailabilityIntervals } from '@/lib/unavailability';
import { loadShopUnavailability } from '@/lib/unavailability-db';

// -----------------------------------------------------------------------------
// Availability engine — the single source of truth for "when can a customer
// book X?". Applies Booksy/Treatwell-style staff-level availability:
//
//   · Each barber has a weekly schedule (inherits shop hours when null).
//   · Each barber has their own blocked dates (vacations / time-off).
//   · A slot is available FOR THAT BARBER iff they're open at that weekday
//     AND the slot is inside their hours AND no existing booking overlaps
//     (taking the client's `serviceBufferMinutes` into account).
//   · A slot is available AT THE SHOP (aka "sin preferencia") iff at least
//     one active barber satisfies the above.
//
// The function also enforces two global scheduling standards:
//   · `minLeadTimeMinutes`: no slot can start before now + minLeadTime
//   · `maxBookingHorizonDays`: the caller must pass a date inside that window
//     (this is enforced by the date picker, but we double-check here too to
//     keep the engine honest).
// -----------------------------------------------------------------------------

export interface TimeSlot {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export interface HoursForDay {
  start: string; // HH:MM
  end: string;   // HH:MM
}

/** Full-week hours map; keys: 'monday'..'sunday' or 'lunes'..'domingo'. */
export type WeeklyHours = Record<string, string>;

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Resolve the open-close window for a given date from a WeeklyHours map.
 * Returns `null` when the day is closed. Accepts both English and Spanish
 * weekday keys so existing configs keep working either way.
 */
export function hoursForDate(date: string, hours: WeeklyHours | null): HoursForDay | null {
  if (!hours) return null;
  const d = new Date(`${date}T00:00:00Z`);
  const weekdayIndex = d.getUTCDay(); // 0 = Sunday
  const keysEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const keysEs = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const value = hours[keysEn[weekdayIndex]] ?? hours[keysEs[weekdayIndex]];
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned || cleaned === 'closed' || cleaned === 'cerrado') return null;
  // Accept "10:00-20:00" or "10:00 - 20:00"
  const parts = cleaned.split('-').map((p) => p.trim());
  if (parts.length !== 2) return null;
  return { start: parts[0], end: parts[1] };
}

function barberHoursForDate(
  barber: BarberConfig,
  date: string,
  shopHours: WeeklyHours | null,
): HoursForDay | null {
  // Inherit shop hours unless the barber has an explicit schedule.
  const effective = barber.hours ?? shopHours;
  return hoursForDate(date, effective);
}

function barberIsBlocked(barber: BarberConfig, date: string, shopBlocked: string[]): boolean {
  if (shopBlocked?.includes(date)) return true;
  return barber.blockedDates?.includes(date) ?? false;
}

export interface AvailabilityOptions {
  clientId: string;
  date: string;
  /** Minutes — the service's duration. */
  serviceDuration: number;
  /** Shop-wide hours, used as fallback for barbers with hours=null. */
  shopHours: WeeklyHours | null;
  /** Shop-wide blocked dates, always apply on top of per-barber blocked. */
  shopBlockedDates: string[];
  /** All active barbers for the shop (config.barbers). */
  barbers: BarberConfig[];
  /** If set, restrict to this specific barber. Otherwise union across all. */
  barberId?: string | null;
  /** Booksy-style "can't book less than X minutes from now". */
  minLeadTimeMinutes: number;
  /** Minutes of cleanup padding after each existing booking. */
  serviceBufferMinutes: number;
  /** If set, reject dates beyond now + this many days. */
  maxBookingHorizonDays: number;
  /**
   * Minutos entre posibles inicios de slot (Booksy-style). Default 15.
   * Con 15 ofrecemos 10:00, 10:15, 10:30… si cada uno cabe entero; así
   * rellenamos micro-gaps y maximizamos conversión. Si es 0 o no se
   * pasa, el paso = duración del servicio (comportamiento legacy).
   */
  slotStepMinutes?: number;
}

/**
 * Compute available slots for a specific barber, or for the shop as a whole
 * (when `barberId` is null/undefined). Slots step is `serviceDuration` so we
 * return clean back-to-back windows.
 */
export async function getAvailableSlotsFromDB(
  opts: AvailabilityOptions,
): Promise<TimeSlot[]> {
  const {
    clientId,
    date,
    serviceDuration,
    shopHours,
    shopBlockedDates,
    barbers,
    barberId,
    minLeadTimeMinutes,
    serviceBufferMinutes,
    maxBookingHorizonDays,
    slotStepMinutes,
  } = opts;

  // Si no viene paso, usamos la duración del servicio (comportamiento legacy
  // para llamadores que aún no lo pasan — back-compat). Validamos un mínimo
  // de 5 min para evitar bucles infinitos con configuraciones erróneas.
  const step = Math.max(5, slotStepMinutes && slotStepMinutes > 0 ? slotStepMinutes : serviceDuration);

  // Guard: date must be inside the horizon window. Older callers pre-filter
  // the date picker so this rarely fires, but belt-and-braces.
  const todayMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  if (date < todayMadrid) return [];
  const horizonDate = new Date(`${todayMadrid}T00:00:00Z`);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + maxBookingHorizonDays);
  if (date > horizonDate.toISOString().slice(0, 10)) return [];

  // Pick the set of barbers to consider.
  const candidates = barberId
    ? barbers.filter((b) => b.id === barberId)
    : barbers;
  if (candidates.length === 0) return [];

  // Drop candidates whose blocked-list excludes this date, or who don't have
  // open hours today. If none remain → no availability.
  const openCandidates = candidates
    .filter((b) => !barberIsBlocked(b, date, shopBlockedDates))
    .map((b) => ({ barber: b, hours: barberHoursForDate(b, date, shopHours) }))
    .filter((x): x is { barber: BarberConfig; hours: HoursForDay } => x.hours != null);
  if (openCandidates.length === 0) return [];

  // Load all bookings for the day across the shop (we filter by barber below).
  // One query is cheaper than one-per-barber.
  const dayBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.date, date),
        ne(bookings.status, 'cancelled'),
      ),
    );

  // Bucket busy intervals per barber (by id AND by name, so legacy string-only
  // bookings keep blocking the right person). Each interval is extended by
  // `serviceBufferMinutes` on the end so the next slot can't touch the previous
  // service (cleanup / prep time).
  const busyByBarberId = new Map<string, Array<{ start: number; end: number }>>();
  const busyByBarberName = new Map<string, Array<{ start: number; end: number }>>();
  for (const b of dayBookings) {
    const start = parseMinutes(b.time);
    const end = start + b.duration + serviceBufferMinutes;
    const interval = { start, end };
    if (b.barberId) {
      const list = busyByBarberId.get(b.barberId) ?? [];
      list.push(interval);
      busyByBarberId.set(b.barberId, list);
    } else if (b.barber && b.barber.trim()) {
      const key = b.barber.trim().toLowerCase();
      const list = busyByBarberName.get(key) ?? [];
      list.push(interval);
      busyByBarberName.set(key, list);
    }
  }

  const busyForBarber = (barber: BarberConfig): Array<{ start: number; end: number }> => [
    ...(busyByBarberId.get(barber.id) ?? []),
    ...(busyByBarberName.get(barber.name.trim().toLowerCase()) ?? []),
  ];

  // Recurring breaks (R12) + ad-hoc blocks/absences (R2) for the day. These
  // SUBTRACT from each barber's open window — the `hours` resolution above is
  // untouched. Empty map ⇒ no extra intervals ⇒ identical slots to before.
  const unavailMap = await loadShopUnavailability(clientId, date);

  // Lead time cutoff — slots starting before this on "today" are excluded.
  let leadCutoff = -Infinity;
  if (date === todayMadrid) {
    const nowMadrid = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [h, m] = nowMadrid.split(':').map(Number);
    leadCutoff = h * 60 + m + minLeadTimeMinutes;
  }

  // For each barber's schedule, emit slots they can serve. A slot is kept in
  // the final output if AT LEAST ONE barber can serve it — union semantics.
  const unionSlots = new Set<string>(); // key: "HH:MM" start
  for (const { barber, hours } of openCandidates) {
    const bhStart = parseMinutes(hours.start);
    const bhEnd = parseMinutes(hours.end);
    const busy = [
      ...busyForBarber(barber),
      ...unavailabilityIntervals(
        date,
        bhStart,
        bhEnd,
        unavailabilityFor(unavailMap, barber.id),
      ),
    ];
    for (let slotStart = bhStart; slotStart + serviceDuration <= bhEnd; slotStart += step) {
      if (slotStart < leadCutoff) continue;
      const slotEnd = slotStart + serviceDuration;
      const blocked = busy.some((p) => slotStart < p.end && slotEnd > p.start);
      if (blocked) continue;
      unionSlots.add(formatMinutes(slotStart));
    }
  }

  return Array.from(unionSlots)
    .sort()
    .map((start) => {
      const endMin = parseMinutes(start) + serviceDuration;
      return { start, end: formatMinutes(endMin) };
    });
}

// -----------------------------------------------------------------------------
// "Any available" resolver — turns a `barberId = null` booking request into a
// specific barber at confirmation time. Pref order:
//   1. Last barber the customer used at this shop, if they're free at the slot.
//   2. The barber with the fewest bookings that day who is free at the slot.
//   3. If tied, lowest displayOrder (deterministic; no randomness in prod).
// Returns null only when nobody is free (shouldn't happen since the picker
// wouldn't have offered the slot — but kept as a safety net).
// -----------------------------------------------------------------------------

export async function pickBarberForCustomer(args: {
  clientId: string;
  customerPhone: string;
  barbers: BarberConfig[];
  date: string;
  time: string;
  duration: number;
  shopHours: WeeklyHours | null;
  shopBlockedDates: string[];
  serviceBufferMinutes: number;
}): Promise<BarberConfig | null> {
  const {
    clientId,
    customerPhone,
    barbers,
    date,
    time,
    duration,
    shopHours,
    shopBlockedDates,
    serviceBufferMinutes,
  } = args;
  if (barbers.length === 0) return null;

  const newStart = parseMinutes(time);
  const newEnd = newStart + duration;

  // All day bookings (all barbers) for overlap check.
  const dayBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.date, date),
        ne(bookings.status, 'cancelled'),
      ),
    );

  // Recurring breaks + ad-hoc blocks/absences for this date. Same additive
  // treatment as getAvailableSlotsFromDB — `hours` resolution untouched.
  const unavailMap = await loadShopUnavailability(clientId, date);

  const isFree = (barber: BarberConfig): boolean => {
    // 1. Barber must have hours today.
    if (barberIsBlocked(barber, date, shopBlockedDates)) return false;
    const hours = barberHoursForDate(barber, date, shopHours);
    if (!hours) return false;
    const bhStart = parseMinutes(hours.start);
    const bhEnd = parseMinutes(hours.end);
    if (newStart < bhStart || newEnd > bhEnd) return false;
    // 2. No overlapping booking (considering buffer).
    for (const b of dayBookings) {
      const isSameBarber =
        (b.barberId && b.barberId === barber.id) ||
        (b.barber && b.barber.trim().toLowerCase() === barber.name.trim().toLowerCase());
      if (!isSameBarber) continue;
      const bStart = parseMinutes(b.time);
      const bEnd = bStart + b.duration + serviceBufferMinutes;
      if (newStart < bEnd && newEnd > bStart) return false;
    }
    // 3. No overlapping break / block / absence for this barber on this date.
    const intervals = unavailabilityIntervals(
      date,
      bhStart,
      bhEnd,
      unavailabilityFor(unavailMap, barber.id),
    );
    for (const iv of intervals) {
      if (newStart < iv.end && newEnd > iv.start) return false;
    }
    return true;
  };

  const freeBarbers = barbers.filter(isFree);
  if (freeBarbers.length === 0) return null;

  // Preference 1: last barber this customer used at this shop, if they're free.
  const customerHistory = await db
    .select({ barberId: bookings.barberId, barber: bookings.barber })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, clientId),
        eq(bookings.customerPhone, customerPhone),
        ne(bookings.status, 'cancelled'),
      ),
    )
    .orderBy(bookings.createdAt);
  // Walk backwards through history to find the most recent successful assignment.
  for (let i = customerHistory.length - 1; i >= 0; i--) {
    const h = customerHistory[i];
    const found = freeBarbers.find(
      (b) =>
        (h.barberId && h.barberId === b.id) ||
        (h.barber && h.barber.trim().toLowerCase() === b.name.trim().toLowerCase()),
    );
    if (found) return found;
  }

  // Preference 2: fewest bookings today (fair spread), ties by displayOrder.
  const countForBarber = (barber: BarberConfig): number =>
    dayBookings.filter(
      (b) =>
        (b.barberId && b.barberId === barber.id) ||
        (b.barber && b.barber.trim().toLowerCase() === barber.name.trim().toLowerCase()),
    ).length;

  freeBarbers.sort((a, b) => {
    const diff = countForBarber(a) - countForBarber(b);
    if (diff !== 0) return diff;
    return a.displayOrder - b.displayOrder;
  });
  return freeBarbers[0];
}
