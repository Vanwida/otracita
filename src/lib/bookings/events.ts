// -----------------------------------------------------------------------------
// booking-events — log inmutable de transiciones de cita (task #107).
//
// Fuente ÚNICA de inserción en `booking_events`. Todos los puntos de mutación
// de una cita (createBooking, PATCH /api/bookings/[id], charge, complete,
// no-show, cron de recordatorios) llaman a `logBookingEvent` para dejar
// rastro humano de qué pasó y quién lo hizo.
//
// REGLA DURA: el log NUNCA debe romper la operación principal. Un fallo
// insertando el evento (DB lenta, columna ausente en una DB sin migrar — el
// repo aplica migraciones lazy, ver CLAUDE.md §6) jamás puede abortar un cobro
// o una reserva. Por eso el INSERT va envuelto en try/catch: si falla, se
// loguea a consola y se sigue. El caller no necesita (ni debe) await-ear el
// resultado como si fuera crítico — devolvemos void y nunca propagamos.
//
// neon-http NO soporta transactions reales (lanza en runtime) — el insert es
// secuencial sobre `db`, mismo patrón que record-tip.ts.
// -----------------------------------------------------------------------------

import { db } from '@/db';
import { bookingEvents } from '@/db/schema';

/** Tipos de evento que registramos. Refleja el comentario del schema. */
export type BookingEventType =
  | 'created'
  | 'confirmed'
  | 'moved'
  | 'resized'
  | 'cancelled'
  | 'no_show'
  | 'completed'
  | 'charged'
  | 'reminder_sent';

/** Quién originó el evento. */
export type BookingEventActor =
  | 'customer'
  | 'barber'
  | 'admin'
  | 'bot'
  | 'system';

export interface LogBookingEventInput {
  /** Tenant — SIEMPRE del session/contexto, nunca del body del request. */
  clientId: string;
  bookingId: string;
  type: BookingEventType;
  actor: BookingEventActor;
  /** Nombre legible del actor ("Reni", "Bot WhatsApp", nombre del cliente). */
  actorLabel?: string | null;
  /** Texto humano corto en castellano para el timeline. */
  summary: string;
  /** Antes/después opcional (fromTime/toTime, amountCents, …). */
  metadata?: Record<string, unknown> | null;
}

/**
 * Inserta un evento de cita. Best-effort: si el INSERT falla, loguea a consola
 * y NO propaga — un fallo de log jamás debe tumbar la operación principal.
 */
export async function logBookingEvent(input: LogBookingEventInput): Promise<void> {
  try {
    await db.insert(bookingEvents).values({
      clientId: input.clientId,
      bookingId: input.bookingId,
      type: input.type,
      actor: input.actor,
      actorLabel: input.actorLabel ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    // El log es secundario: nunca rompe la reserva/cobro que lo disparó.
    console.error('[logBookingEvent] insert failed (non-fatal):', err, {
      bookingId: input.bookingId,
      type: input.type,
    });
  }
}

/**
 * Deriva el actor + label de una cita recién creada a partir de su `source`.
 * Fuente única para que createBooking y cualquier otro caller etiqueten igual.
 *
 *   bot          → actor 'bot',      label "Bot WhatsApp"
 *   web | pwa    → actor 'customer', label = nombre del cliente (o null)
 *   dashboard    → actor 'barber',   label = nombre del barbero (o null)
 *   import*      → actor 'system',   label "Importación"
 *   voice        → actor 'bot',      label "Recepcionista IA"
 *   resto        → actor 'system'
 */
export function createdEventActor(
  source: string,
  opts?: { customerName?: string | null; barberName?: string | null },
): { actor: BookingEventActor; actorLabel: string | null } {
  switch (source) {
    case 'bot':
      return { actor: 'bot', actorLabel: 'Bot WhatsApp' };
    case 'voice':
      return { actor: 'bot', actorLabel: 'Recepcionista IA' };
    case 'web':
    case 'pwa':
      return { actor: 'customer', actorLabel: opts?.customerName?.trim() || null };
    case 'dashboard':
    case 'manual':
      return { actor: 'barber', actorLabel: opts?.barberName?.trim() || null };
    case 'import':
    case 'import_ical':
    case 'booksy':
      return { actor: 'system', actorLabel: 'Importación' };
    default:
      return { actor: 'system', actorLabel: null };
  }
}
