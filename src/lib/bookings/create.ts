import { db } from '@/db';
import { barbers as barbersTable, bookings, bookingServices, clients, customers } from '@/db/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { pickBarberForCustomer } from '@/lib/availability';
import { computeBookingSnapshot, type BookingServiceLine } from '@/lib/bookings/duration';
import type { BarberConfig } from '@/lib/whatsapp/config';

// -----------------------------------------------------------------------------
// Shared booking creation pipeline.
//
// Both the dashboard-authenticated REST endpoint (`/api/bookings/create`) and
// the voice-agent endpoint (`/api/voice/book`) MUST funnel through this single
// function so they stay in sync on:
//   - input validation
//   - lead time / horizon / buffer enforcement (shop-level standards)
//   - conflict detection (respecting per-barber hours AND buffer)
//   - "any available" resolution into a real barber_id
//   - auto-invoicing for tenants with invoicing enabled
//
// A previous bug here persisted the literal string "Sin preferencia" as a
// barber name whenever the customer had no preference — the daily agenda
// view groups by barber name and rendered those rows invisible. The fix is
// architectural: `bookings.barber_id` now refers to a real row in `barbers`,
// and the resolver `pickBarberForCustomer` turns "any" into a specific
// person at write time.
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
  /** Specific barber id, if the customer chose one. When null/undefined, we
   *  auto-assign using pickBarberForCustomer. */
  barberId?: string | null;
  /** YYYY-MM-DD (Europe/Madrid). */
  date: string;
  /** HH:MM 24h. */
  time: string;
  /** Minutes. Must be > 0. When omitted we derive from the client's service config. */
  duration?: number;
  /** Euros, VAT-inclusive. Optional. */
  price?: number | null;
  /** Servicios EXTRA además del principal (R7). Solo el caller del dashboard
   *  los envía. Si está ausente/vacío, el comportamiento es IDÉNTICO al de
   *  hoy (bot/voice/import/cron no lo pasan → 4 de 5 callers sin cambios).
   *  Cuando hay extras: `bookings.duration` snapshot = principal + suma(extras)
   *  para que el chequeo de solape reserve el hueco real, y la factura emite
   *  una línea por servicio. `bookings.service`/`price` siguen siendo el
   *  snapshot del PRINCIPAL (compat agenda/loyalty/followup). */
  extraServices?: BookingServiceLine[] | null;
  /** Booking source tag — defaults to 'bot'. */
  source?: string;
  /** Last-touch attribution para ESTA reserva. Se guarda en bookings.referrer*.
   *  Si el customer es nuevo (primera reserva), también alimenta los
   *  first_source* de customers. Null si el caller no captura atribución
   *  (caso bot/manual/voice). */
  attribution?: {
    source: string;
    medium: string;
    campaign: string | null;
  } | null;
}

export type CreateBookingError =
  | 'validation'
  | 'overlap'
  | 'lead_time'
  | 'horizon'
  | 'no_barber_available';

export type CreateBookingResult =
  | { success: true; booking: BookingRow }
  | { success: false; error: CreateBookingError; message: string };

interface ConfiguredService {
  name: string;
  duration: number;
  price?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
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

/** Days between two YYYY-MM-DD dates (positive if `to` > `from`). */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

async function loadActiveBarbers(clientId: string): Promise<BarberConfig[]> {
  const rows = await db
    .select()
    .from(barbersTable)
    .where(and(eq(barbersTable.clientId, clientId), eq(barbersTable.active, true)))
    .orderBy(asc(barbersTable.displayOrder), asc(barbersTable.name));
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    hours: (b.hours as Record<string, string> | null) ?? null,
    blockedDates: (b.blockedDates as string[]) ?? [],
    displayOrder: b.displayOrder,
  }));
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
    barberId,
    date,
    time,
    extraServices,
    source = 'bot',
    attribution,
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
  const primaryDuration = options.duration ?? configured.duration;
  const price = options.price ?? configured.price;

  if (!primaryDuration || primaryDuration <= 0) {
    return { success: false, error: 'validation', message: 'duration must be greater than 0' };
  }

  // Snapshot persistido en bookings.duration = principal + suma(extras).
  // FOOT-GUN: este `duration` (no `primaryDuration`) es el que alimenta el
  // chequeo de solape más abajo Y el que se guarda. Si guardáramos solo el
  // principal, una cita multi-servicio reservaría un hueco demasiado corto y
  // el motor permitiría doble-booking encima de su segunda mitad. Sin extras
  // computeBookingSnapshot devuelve exactamente primaryDuration → 4 de 5
  // callers (bot/voice/import/cron) no cambian de comportamiento.
  const extras = extraServices && extraServices.length > 0 ? extraServices : null;
  const { durationMin: duration } = computeBookingSnapshot(primaryDuration, extras);

  // --- Standards: lead time + horizon ---------------------------------------
  const now = new Date();
  const todayMadrid = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  if (date === todayMadrid) {
    const nowMadrid = now.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const nowMin = toMinutes(nowMadrid);
    const slotStart = toMinutes(time);
    if (slotStart < nowMin + client.minLeadTimeMinutes) {
      return {
        success: false,
        error: 'lead_time',
        message: `La reserva debe hacerse al menos ${client.minLeadTimeMinutes} min antes del servicio.`,
      };
    }
  }
  const horizonDays = daysBetween(todayMadrid, date);
  if (horizonDays > client.maxBookingHorizonDays) {
    return {
      success: false,
      error: 'horizon',
      message: `Solo aceptamos reservas hasta ${client.maxBookingHorizonDays} días por adelantado.`,
    };
  }

  // --- Load active barbers --------------------------------------------------
  const activeBarbers = await loadActiveBarbers(client.id);
  if (activeBarbers.length === 0) {
    return {
      success: false,
      error: 'validation',
      message: 'La barbería no tiene profesionales configurados.',
    };
  }

  // --- Conflict check (considers buffer) ------------------------------------
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

  const bufferMin = client.serviceBufferMinutes;
  const newStart = toMinutes(time);
  const newEnd = newStart + duration;
  const overlapsForBarber = (barber: BarberConfig): boolean => {
    return existingOnDay.some((b) => {
      const isSame =
        (b.barberId && b.barberId === barber.id) ||
        (b.barber && b.barber.trim().toLowerCase() === barber.name.trim().toLowerCase());
      if (!isSame) return false;
      const bStart = toMinutes(b.time);
      const bEnd = bStart + b.duration + bufferMin;
      return newStart < bEnd && newEnd > bStart;
    });
  };

  // --- Barber resolution ----------------------------------------------------
  let resolved: BarberConfig | null = null;
  if (barberId) {
    const requested = activeBarbers.find((b) => b.id === barberId);
    if (!requested) {
      return {
        success: false,
        error: 'validation',
        message: 'El profesional indicado no existe o está inactivo.',
      };
    }
    if (overlapsForBarber(requested)) {
      return {
        success: false,
        error: 'overlap',
        message: 'Ya hay una reserva en ese horario.',
      };
    }
    resolved = requested;
  } else {
    // "Any available" — last-barber-first heuristic.
    resolved = await pickBarberForCustomer({
      clientId: client.id,
      customerPhone: customerPhone.trim(),
      barbers: activeBarbers,
      date,
      time,
      duration,
      shopHours: (client.chatbotHours as Record<string, string> | null) ?? null,
      shopBlockedDates: (client.blockedDates as string[]) ?? [],
      serviceBufferMinutes: bufferMin,
    });
    if (!resolved) {
      return {
        success: false,
        error: 'no_barber_available',
        message: 'No hay profesionales libres en ese horario.',
      };
    }
  }

  // --- Insert ---------------------------------------------------------------
  const [created] = await db
    .insert(bookings)
    .values({
      clientId: client.id,
      customerPhone: customerPhone.trim(),
      customerName: customerName ? customerName.trim() : null,
      service,
      // Persist BOTH the id (canonical) and the name (snapshot, survives renames).
      barberId: resolved.id,
      barber: resolved.name,
      date,
      time,
      duration,
      price: price ?? null,
      status: 'confirmed',
      source,
      // Last-touch attribution para esta reserva. Null si no se capturó —
      // típico para bot/manual/voice. Solo PWA y voice pueden traer esto.
      referrerSource: attribution?.source ?? null,
      referrerMedium: attribution?.medium ?? null,
      referrerCampaign: attribution?.campaign ?? null,
    })
    .returning();

  // --- Servicios extra (R7) -------------------------------------------------
  // Solo cuando el caller los envió (dashboard). Aditivo: el principal ya
  // está en bookings.service/duration/price; estos son los EXTRA. Si esto
  // falla no tumbamos la reserva (ya está creada) — log y seguimos; el
  // barbero puede re-añadirlos editando la cita.
  if (extras && extras.length > 0) {
    try {
      await db.insert(bookingServices).values(
        extras.map((s, idx) => ({
          bookingId: created.id,
          name: s.name,
          durationMin: s.durationMin,
          priceEuros: s.priceEuros ?? null,
          displayOrder: idx,
        })),
      );
    } catch (err) {
      console.error('[createBooking] booking_services insert failed:', err);
    }
  }

  // --- Upsert customer + increment counters -------------------------------
  // Every successful booking, regardless of source (web, bot, voice,
  // dashboard), must leave a customer row so downstream systems —
  // WhatsApp bot recognition, /dashboard/clientes, reputation tracking,
  // no-show decay — identify this person consistently.
  try {
    const normalisedPhone = customerPhone.trim();
    const cleanName = customerName ? customerName.trim() : null;
    const [existingCustomer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.clientId, client.id),
          eq(customers.phone, normalisedPhone),
        ),
      );
    if (existingCustomer) {
      await db
        .update(customers)
        .set({
          name: cleanName ?? existingCustomer.name,
          totalBookings: sql`${customers.totalBookings} + 1`,
          lastBookingAt: new Date(),
        })
        .where(eq(customers.id, existingCustomer.id));
    } else {
      // Customer NUEVO → guardamos first-touch attribution. NUNCA se
      // sobrescribe en updates posteriores: el first-touch es para
      // siempre el origen de la primera reserva.
      await db.insert(customers).values({
        clientId: client.id,
        phone: normalisedPhone,
        name: cleanName,
        totalBookings: 1,
        lastBookingAt: new Date(),
        firstSource: attribution?.source ?? null,
        firstSourceMedium: attribution?.medium ?? null,
        firstSourceCampaign: attribution?.campaign ?? null,
        firstSourceCapturedAt: attribution ? new Date() : null,
      });
    }
  } catch (err) {
    // Don't fail the booking if the customer-upsert has a transient error —
    // the booking itself is already saved. Log and move on.
    console.error('[createBooking] customer upsert failed:', err);
  }

  // Auto-facturación: NO se dispara aquí. La factura se emite cuando el
  // barbero marca el booking como `completed` (botón en agenda) o el cron
  // de safety net cierra bookings olvidados pasados 3 días. Esto permite
  // incluir productos vendidos durante la cita en la misma factura.
  // Ver `tryAutoInvoiceForCompletedBooking` en `src/lib/invoicing.ts`.

  // --- Push notification (fire-and-forget) ---------------------------------
  // If this phone belongs to an app user with a subscription for THIS
  // barbería, send an instant confirmation to their phone/PWA. Silently
  // noops for guests without an app account.
  //
  // Skipped when the booking came from the WhatsApp bot — the engine
  // sends a "Cita confirmada" reply in the same chat thread right after,
  // so the push would just duplicate the same notification.
  if (source !== 'bot') {
    (async () => {
      try {
        const { sendPushByPhone } = await import('@/lib/app-auth/push');
        const dateLabel = created.date.split('-').reverse().join('/'); // DD/MM/YYYY
        await sendPushByPhone(customerPhone.trim(), client.id, {
          title: `Cita confirmada en ${client.businessName}`,
          body: `${created.service}${resolved ? ` con ${resolved.name}` : ''} · ${dateLabel} a las ${created.time}`,
          url: client.publicSlug ? `/b/${client.publicSlug}/cuenta` : '/',
          tag: `booking-${created.id}`,
          data: { bookingId: created.id, kind: 'booking_confirmed' },
        });
      } catch (err) {
        // push failures never break the booking flow
        console.error('[createBooking] push failed:', err);
      }
    })();
  }

  return { success: true, booking: created };
}
