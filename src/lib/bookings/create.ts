import { db } from '@/db';
import { bookings, clients } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { assignBarber } from '@/lib/availability';
import { shouldAutoInvoiceBooking, tryAutoInvoiceInBackground } from '@/lib/invoicing';

// -----------------------------------------------------------------------------
// Shared booking creation pipeline.
//
// Both the dashboard-authenticated REST endpoint (`/api/bookings/create`) and
// the voice-agent endpoint (`/api/voice/book`) MUST funnel through this single
// function so they stay in sync on:
//   - input validation
//   - conflict (overlap) detection
//   - barber auto-assignment
//   - auto-invoicing for tenants with invoicing enabled
//
// A previous bug in `/api/voice/book` skipped all three — voice reservations
// silently double-booked slots and never emitted fiscal docs even when the
// tenant had invoicing enabled. This module is the fix.
// -----------------------------------------------------------------------------

export type ClientRow = typeof clients.$inferSelect;
export type BookingRow = typeof bookings.$inferSelect;

/** Pre-validated configuration needed to create a booking. */
export interface CreateBookingOptions {
  /** Owning tenant — already resolved via auth; we do NOT trust the caller. */
  client: ClientRow;
  customerPhone: string;
  customerName?: string | null;
  service: string;
  /** Optional barber preference. If omitted, auto-assigned. */
  barber?: string | null;
  /** YYYY-MM-DD (Europe/Madrid). */
  date: string;
  /** HH:MM 24h. */
  time: string;
  /** Minutes. Must be > 0. When omitted we derive from the client's service config. */
  duration?: number;
  /** Euros, VAT-inclusive. Optional. */
  price?: number | null;
  /** Booking source tag — defaults to 'bot'. */
  source?: string;
}

export type CreateBookingError =
  | 'validation'
  | 'overlap';

export type CreateBookingResult =
  | { success: true; booking: BookingRow }
  | { success: false; error: CreateBookingError; message: string };

interface ConfiguredService {
  name: string;
  duration: number;
  price?: number;
}

interface ConfiguredBarber {
  name: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hasTimeOverlap(
  existTime: string,
  existDuration: number,
  newTime: string,
  newDuration: number,
): boolean {
  const existStart = toMinutes(existTime);
  const existEnd = existStart + existDuration;
  const newStart = toMinutes(newTime);
  const newEnd = newStart + newDuration;
  return existStart < newEnd && existEnd > newStart;
}

function resolveServiceConfig(
  client: ClientRow,
  serviceName: string,
): { duration: number; price: number | null } {
  const services = (client.chatbotServices as ConfiguredService[] | null) || [];
  const match = services.find((s) => s?.name?.toLowerCase() === serviceName.toLowerCase());
  return {
    duration: match?.duration ?? 30,
    price: typeof match?.price === 'number' ? match.price : null,
  };
}

/**
 * Validate, check for overlap, assign barber, insert, and fire auto-invoice.
 * Never throws user-facing validation errors as exceptions — returns a result
 * object so callers can map cleanly to HTTP status codes.
 */
export async function createBooking(
  options: CreateBookingOptions,
): Promise<CreateBookingResult> {
  const {
    client,
    customerPhone,
    customerName,
    service,
    barber,
    date,
    time,
    source = 'bot',
  } = options;

  // --- Input validation -----------------------------------------------------
  if (!customerPhone || !customerPhone.trim()) {
    return { success: false, error: 'validation', message: 'customerPhone is required' };
  }
  if (!service || !service.trim()) {
    return { success: false, error: 'validation', message: 'service is required' };
  }
  if (!date || !DATE_RE.test(date)) {
    return { success: false, error: 'validation', message: 'Invalid date format (YYYY-MM-DD)' };
  }
  if (!time || !TIME_RE.test(time)) {
    return { success: false, error: 'validation', message: 'Invalid time format (HH:MM)' };
  }

  // Derive duration/price from service config when caller didn't provide them.
  const configured = resolveServiceConfig(client, service);
  const duration = options.duration ?? configured.duration;
  const price = options.price ?? configured.price;

  if (!duration || duration <= 0) {
    return { success: false, error: 'validation', message: 'duration must be greater than 0' };
  }

  // --- Conflict check -------------------------------------------------------
  const existingOnDay = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.date, date),
        ne(bookings.status, 'cancelled'),
      ),
    );

  const conflicts = existingOnDay.filter((b) => {
    // If a barber was specified, only the same barber (or unassigned rows
    // with no barber) can conflict. Otherwise all day rows conflict on overlap.
    if (barber) {
      if (b.barber && b.barber.toLowerCase() !== barber.toLowerCase()) return false;
    }
    return hasTimeOverlap(b.time, b.duration, time, duration);
  });

  if (conflicts.length > 0) {
    return {
      success: false,
      error: 'overlap',
      message: 'Ya hay una reserva en ese horario.',
    };
  }

  // --- Barber auto-assignment ----------------------------------------------
  const barberNames = ((client.booksyServices as ConfiguredBarber[] | null) || [])
    .map((b) => b?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  const resolvedBarber =
    barber ||
    (barberNames.length > 0
      ? await assignBarber(client.id, barberNames, date, time, duration)
      : null);

  // --- Insert ---------------------------------------------------------------
  const [created] = await db
    .insert(bookings)
    .values({
      clientId: client.id,
      customerPhone: customerPhone.trim(),
      customerName: customerName ? customerName.trim() : null,
      service,
      barber: resolvedBarber,
      date,
      time,
      duration,
      price: price ?? null,
      status: 'confirmed',
      source,
    })
    .returning();

  // --- Auto-invoice (fire-and-forget) --------------------------------------
  if (created && shouldAutoInvoiceBooking(created) && client.invoicingEnabled) {
    tryAutoInvoiceInBackground(created.id);
  }

  return { success: true, booking: created };
}
