import { db } from '@/db';
import { appUsers, barbers as barbersTable, bookings, bookingServices, clients, customers } from '@/db/schema';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { pickBarberForCustomer } from '@/lib/availability';
import { unavailabilityFor, unavailabilityIntervals } from '@/lib/unavailability';
import { loadShopUnavailability } from '@/lib/unavailability-db';
import { loadShopOverridesForDate } from '@/lib/shop-day-overrides';
import {
  computeBookingSnapshot,
  hasBookingOverlap,
  type BookingServiceLine,
} from '@/lib/bookings/duration';
import { canonicalPhone } from '@/lib/phone';
import { verifyConfirmedSetupIntent } from '@/lib/stripe/setup-intent';
import type { BarberConfig } from '@/lib/whatsapp/config';
import { BUSINESS_TIMEZONE } from '@/lib/time';
import { publicAccountPath } from '@/lib/site';

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
  /** Email opcional del cliente. Solo se persiste en `customers.email`,
   *  nunca en `bookings`. Se guarda al crear el customer; en updates solo
   *  rellena si el email actual es NULL (jamás pisa un email puesto por
   *  el barbero en /dashboard/clientes). */
  customerEmail?: string | null;
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
  /** Consentimiento + tarjeta guardada para la tarifa de no-show. Solo lo
   *  manda el caller web/PWA cuando el negocio tiene `noShowFeeCents > 0`.
   *  `setupIntentId` = el SetupIntent que el cliente confirmó en el
   *  navegador (se RE-VALIDA aquí contra Stripe — nunca se confía en el
   *  cliente). `source` = de qué superficie vino el checkbox de consent.
   *  El bot WhatsApp NUNCA lo manda (exento). Ausente → ver `requireCard`. */
  cardConsent?: {
    setupIntentId: string;
    /** El cliente marcó el checkbox de "acepto el cargo si no me presento". */
    consented: boolean;
    source: 'web' | 'pwa';
  } | null;
  /** El caller (ruta pública) ya resolvió que esta reserva EXIGE tarjeta
   *  consentida (negocio con tarifa + origen web/PWA). Si es true y no
   *  llega un `cardConsent` válido, la reserva se rechaza con
   *  'card_required' (no se crea). Bot/dashboard nunca lo ponen → flujo
   *  idéntico al de hoy. */
  requireCard?: boolean;
  /** Override de admin: permitir solape con citas existentes. Solo el
   *  dashboard lo manda (tras confirm del barbero "esto se solapa, ¿seguro?").
   *  Bot/PWA NUNCA — los clientes no pueden saltarse el solape. NO se salta
   *  los descansos/bloqueos (esos no son "calendar conflict", son
   *  imposibilidad física). */
  allowOverlap?: boolean;
  /** Importación masiva: no manda push al cliente y no dispara nada hacia
   *  él. El cliente original ya tiene la cita en su sistema viejo (Booksy/
   *  Treatwell). Mandarle "Cita confirmada" sería confuso. Default false →
   *  comportamiento idéntico para callers existentes. Solo lo usa la
   *  ruta de import .ics. */
  silent?: boolean;
  /** UID iCal del VEVENT origen — clave de idempotencia para imports .ics.
   *  Si ya existe un booking con (clientId, importedIcalUid) → skip antes
   *  de entrar a la pipeline. Default null para 5/5 callers existentes. */
  importedIcalUid?: string | null;
}

export type CreateBookingError =
  | 'validation'
  | 'overlap'
  | 'lead_time'
  | 'horizon'
  | 'no_barber_available'
  | 'card_required';

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
// Validación de email deliberadamente laxa (RFC completo es inviable y
// rechaza addresses válidas raras). Solo descartamos basura evidente.
// Fuente única — la comparte la API pública y el editor del dashboard
// vía `isValidEmail`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email no vacío con forma plausible. Vacío/whitespace → false. */
export function isValidEmail(raw: string): boolean {
  const v = raw.trim();
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v);
}

/** Normaliza un email para guardar: trim + lowercase, o null si vacío. */
function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return v.length > 0 ? v : null;
}

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

/**
 * Busca el email de la sesión PWA (app_users) por teléfono. Enlace
 * direccional app→customer: solo lo usamos para SEMBRAR un email cuando
 * el customer no tiene uno. `app_users.phone` es UNIQUE global (no per
 * tenant) — el mismo teléfono = la misma persona aunque reserve en
 * varias barberías. Devuelve null si no hay app user o no tiene email.
 */
async function lookupAppUserEmail(phone: string): Promise<string | null> {
  const [u] = await db
    .select({ email: appUsers.email })
    .from(appUsers)
    .where(eq(appUsers.phone, phone))
    .limit(1);
  return normaliseEmail(u?.email ?? null);
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
    customerEmail,
    service,
    barberId,
    date,
    time,
    extraServices,
    source = 'bot',
    attribution,
    cardConsent,
    requireCard = false,
    allowOverlap = false,
    silent = false,
    importedIcalUid = null,
  } = options;

  // --- Input validation -----------------------------------------------------
  if (!customerPhone || !customerPhone.trim()) {
    return { success: false, error: 'validation', message: 'customerPhone is required' };
  }
  // Canonicalize ONCE here. Every downstream use — barber resolution,
  // customer match/upsert, the value stored on bookings.customer_phone,
  // and the push-by-phone lookup — must use the SAME canonical string so
  // the same human is one customer row regardless of how the phone was
  // typed (644… / +34644… / 34644… / 0034…). Invalid input keeps its raw
  // form (canonicalPhone never throws / never empties a non-empty input
  // that fails to parse) so the booking is still created and attributable.
  const canonicalCustomerPhone = canonicalPhone(customerPhone);
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
  // Estas dos guardas protegen contra abuso EXTERNO (bot WhatsApp, PWA pública,
  // voice). El barbero añadiendo una cita a mano desde el dashboard es DUEÑO
  // de su agenda — puede meter una cita "en 5 minutos" (walk-in que llega
  // ahora) o "en 18 meses" (cliente que reserva con antelación) sin que el
  // sistema le diga "no puedes". Por eso `source === 'dashboard'` salta ambas.
  const isManualFromDashboard = source === 'dashboard';
  const now = new Date();
  const todayMadrid = now.toLocaleDateString('en-CA', { timeZone: BUSINESS_TIMEZONE });
  if (!isManualFromDashboard && date === todayMadrid) {
    const nowMadrid = now.toLocaleTimeString('en-GB', {
      timeZone: BUSINESS_TIMEZONE,
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
  if (!isManualFromDashboard) {
    const horizonDays = daysBetween(todayMadrid, date);
    if (horizonDays > client.maxBookingHorizonDays) {
      return {
        success: false,
        error: 'horizon',
        message: `Solo aceptamos reservas hasta ${client.maxBookingHorizonDays} días por adelantado.`,
      };
    }
  }

  // --- No-show fee: tarjeta consentida (web/PWA, fee activo) ----------------
  // `requireCard` lo pone SOLO la ruta pública cuando el negocio tiene
  // `noShowFeeCents > 0` y la reserva es web/PWA. El bot WhatsApp NUNCA lo
  // pone (exento — no hay superficie de tarjeta). Si se exige, validamos el
  // SetupIntent CONTRA STRIPE (nunca confiamos en el cliente) y exigimos el
  // checkbox de consentimiento. Sin tarjeta válida → la reserva NO se crea.
  // `verifiedCard` se persiste en el customer más abajo para que el cobro
  // off-session de no-show (no-show-fee.ts) encuentre Customer + PM.
  let verifiedCard: { stripeCustomerId: string; paymentMethodId: string } | null =
    null;
  if (requireCard) {
    if (
      !cardConsent ||
      !cardConsent.consented ||
      !cardConsent.setupIntentId ||
      (cardConsent.source !== 'web' && cardConsent.source !== 'pwa')
    ) {
      return {
        success: false,
        error: 'card_required',
        message:
          'Para reservar online debes guardar una tarjeta y aceptar la tarifa por no presentarte.',
      };
    }
    verifiedCard = await verifyConfirmedSetupIntent({
      setupIntentId: cardConsent.setupIntentId,
      clientId: client.id,
      customerPhone: canonicalCustomerPhone,
    });
    if (!verifiedCard) {
      return {
        success: false,
        error: 'card_required',
        message:
          'No pudimos validar tu tarjeta. Vuelve a introducirla para completar la reserva.',
      };
    }
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
  // Solape: predicado puro compartido (mismo buffer + match barberId|nombre
  // en `hasBookingOverlap`, fuente única) en vez de reimplementar el clash
  // aquí. Al CREAR no hay cita propia → selfId null.
  const overlapsForBarber = (barber: BarberConfig): boolean => {
    // Admin override (dashboard tras confirm del barbero): permitir solape
    // explícito. NO afecta a descansos/bloqueos (esos son inviolables).
    if (allowOverlap) return false;
    return hasBookingOverlap(
      {
        selfId: null,
        startMinutes: newStart,
        durationMin: duration,
        barberId: barber.id,
        barber: barber.name,
      },
      existingOnDay,
      bufferMin,
    );
  };

  // Recurring breaks (R12) + ad-hoc blocks/absences (R2) — a manual booking
  // with an explicit barber must not land inside one either. The "any
  // available" path already enforces this via pickBarberForCustomer; this
  // covers the explicit-barberId path. Wide clamp [0,1440) so the raw
  // break/block ranges come back unclipped for the overlap test.
  const unavailMap = await loadShopUnavailability(client.id, date);
  const hitsBreakOrBlock = (barber: BarberConfig): boolean => {
    const intervals = unavailabilityIntervals(
      date,
      0,
      24 * 60,
      unavailabilityFor(unavailMap, barber.id),
    );
    return intervals.some((iv) => newStart < iv.end && newEnd > iv.start);
  };

  // --- Barber resolution ----------------------------------------------------
  // `barberWasRequested` = el caller pasó un barberId explícito (el cliente
  // PIDIÓ a esa persona) vs lo elegimos nosotros con pickBarberForCustomer.
  // Alimenta bookings.barberRequested → ♥ "Solicitado por el cliente" (A2).
  const barberWasRequested = Boolean(barberId);
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
    if (hitsBreakOrBlock(requested)) {
      return {
        success: false,
        error: 'overlap',
        message: 'El profesional no está disponible en ese horario (descanso o ausencia).',
      };
    }
    resolved = requested;
  } else {
    // "Any available" — last-barber-first heuristic.
    resolved = await pickBarberForCustomer({
      clientId: client.id,
      customerPhone: canonicalCustomerPhone,
      barbers: activeBarbers,
      date,
      time,
      duration,
      shopHours: (client.chatbotHours as Record<string, string> | null) ?? null,
      shopDayOverrides: await loadShopOverridesForDate(client.id, date),
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
      customerPhone: canonicalCustomerPhone,
      customerName: customerName ? customerName.trim() : null,
      service,
      // Persist BOTH the id (canonical) and the name (snapshot, survives renames).
      barberId: resolved.id,
      barber: resolved.name,
      // A2: true solo si el cliente pidió a este barbero explícitamente.
      barberRequested: barberWasRequested,
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
      // UID iCal del VEVENT origen (idempotencia per tenant). Null para
      // todo lo que no sea import .ics.
      importedIcalUid: importedIcalUid ?? null,
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
    const normalisedPhone = canonicalCustomerPhone;
    const cleanName = customerName ? customerName.trim() : null;
    // Email aportado por el caller (PWA). Solo lo aceptamos si tiene forma
    // válida — un email basura es peor que NULL (rompe envíos futuros).
    const callerEmail =
      customerEmail && isValidEmail(customerEmail)
        ? normaliseEmail(customerEmail)
        : null;

    // Tarjeta consentida verificada (solo web/PWA con fee activo). Una
    // fuente, se aplica igual en insert y update — sin esto el cobro
    // off-session de no-show no encuentra Customer/PM. Vacío en bot/
    // dashboard/fee-off → no toca estas columnas (comportamiento idéntico).
    const cardConsentFields =
      verifiedCard && cardConsent
        ? {
            stripeCustomerId: verifiedCard.stripeCustomerId,
            defaultPaymentMethodId: verifiedCard.paymentMethodId,
            cardConsentAt: new Date(),
            cardConsentSource: cardConsent.source,
          }
        : null;

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
      // Backfill de email SOLO si está vacío. El email puesto por el
      // barbero en /dashboard/clientes siempre gana — nunca lo pisamos
      // con lo que escriba el cliente en el form público. Si el customer
      // ya tiene email, no tocamos esa columna.
      let backfillEmail: string | null = null;
      if (!existingCustomer.email) {
        backfillEmail = callerEmail ?? (await lookupAppUserEmail(normalisedPhone));
      }
      await db
        .update(customers)
        .set({
          name: cleanName ?? existingCustomer.name,
          ...(backfillEmail ? { email: backfillEmail } : {}),
          ...(cardConsentFields ?? {}),
          totalBookings: sql`${customers.totalBookings} + 1`,
          lastBookingAt: new Date(),
        })
        .where(eq(customers.id, existingCustomer.id));
    } else {
      // Customer NUEVO → guardamos first-touch attribution. NUNCA se
      // sobrescribe en updates posteriores: el first-touch es para
      // siempre el origen de la primera reserva.
      //
      // Email: el del caller manda; si no lo trae, intentamos enlazarlo
      // UNA vez desde la sesión de la PWA (app_users.email) por teléfono.
      // Direccional app→customer; cualquier email posterior del barbero
      // gana (solo rellenamos aquí porque la fila acaba de nacer).
      const seedEmail = callerEmail ?? (await lookupAppUserEmail(normalisedPhone));
      await db.insert(customers).values({
        clientId: client.id,
        phone: normalisedPhone,
        name: cleanName,
        email: seedEmail,
        ...(cardConsentFields ?? {}),
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
  //
  // También skipped si el caller pasó `silent: true` — caso típico:
  // importación masiva desde .ics, donde el cliente ya tiene la cita
  // en su sistema viejo y un push extra sería ruido.
  if (source !== 'bot' && !silent) {
    (async () => {
      try {
        const { sendPushByPhone } = await import('@/lib/app-auth/push');
        const dateLabel = created.date.split('-').reverse().join('/'); // DD/MM/YYYY
        await sendPushByPhone(canonicalCustomerPhone, client.id, {
          title: `Cita confirmada en ${client.businessName}`,
          body: `${created.service}${resolved ? ` con ${resolved.name}` : ''} · ${dateLabel} a las ${created.time}`,
          url: client.publicSlug ? publicAccountPath(client.publicSlug) : '/',
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
