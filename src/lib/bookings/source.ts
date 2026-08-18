// -----------------------------------------------------------------------------
// Origen de una reserva (`bookings.source`) — fuente única de la verdad sobre
// qué canales son "self-service".
//
// Self-service = el propio cliente reserva sin que intervenga el barbero:
//   · 'bot'   → bot de WhatsApp
//   · 'web'   → PWA pública / página de reservas
//   · 'voice' → recepcionista de voz
//
// NO self-service (el barbero/operador crea la cita a mano):
//   · 'dashboard' → "Nueva cita" en la agenda
//   · 'import'    → migración de citas (.ics / capturas)
//
// Regla de negocio: un cliente con reputation='blocked' NO puede reservar por
// los canales self-service, pero el barbero SÍ puede agendarlo a mano desde el
// dashboard (la UI ya le avisa de que está bloqueado). Por eso el chequeo de
// bloqueo en `createBooking` solo aplica cuando isSelfServiceSource(source).
//
// Pure: sin DB ni I/O. Testeable con `node --test`.
// -----------------------------------------------------------------------------

export const SELF_SERVICE_SOURCES = ['bot', 'web', 'voice'] as const;

export function isSelfServiceSource(source: string): boolean {
  return (SELF_SERVICE_SOURCES as readonly string[]).includes(source);
}

// -----------------------------------------------------------------------------
// Importaciones — citas que NO nacieron en otracita.
//
// Dos puertas de importación, cada una con su tag de `source`:
//   · 'import'      → captura de pantalla vía Vision (`/api/bookings/import-vision`)
//   · 'import_ical' → export .ics de Booksy/Treatwell (`/api/imports/bookings`)
//
// Las que vienen del .ics además llevan `imported_ical_uid` (clave de
// idempotencia). Lo miramos también por defensa en profundidad: si alguien
// cambia el tag de source, la marca del UID sigue delatando el origen.
// -----------------------------------------------------------------------------

export const IMPORT_SOURCES = ['import', 'import_ical'] as const;

export function isImportSource(source: string): boolean {
  return (IMPORT_SOURCES as readonly string[]).includes(source);
}

/** Los datos mínimos para datar una cita importada. */
export interface ImportedBookingFacts {
  source: string;
  /** Fecha de la CITA, YYYY-MM-DD. */
  date: string;
  /** Cuándo entró la fila en otracita (`bookings.created_at`). */
  createdAt: Date | null;
  /** UID del VEVENT si vino de un .ics. */
  importedIcalUid?: string | null;
}

/**
 * ¿Es un BACKFILL histórico? — una cita importada cuya fecha ya era pasado el
 * día en que se importó. Es decir: ocurrió en Booksy, antes de otracita.
 *
 * Por qué importa (L-15): el sweep de `cron/reminders` cierra a `completed`
 * toda cita `confirmed` de hace >3 días, y `completed` + `price` es lo que
 * suma en ingresos/caja/P&L (`periodRevenueComponents`). Sin este filtro, un
 * barbero que migra subiendo su agenda de junio se encuentra la caja de junio
 * inflada con dinero que cobró en Booksy. El sweep NO se toca — solo aprende
 * a saltarse los backfills.
 *
 * Ojo con lo que NO es backfill: una cita FUTURA importada el día de la
 * migración (te vas de Booksy el 1 de agosto y traes las citas del 5) sí
 * ocurre en otracita, sí es ingreso suyo, y sigue entrando en el sweep como
 * cualquier otra.
 *
 * Pura: sin DB ni I/O. `timeZone` explícito (el caller pasa BUSINESS_TIMEZONE)
 * para no arrastrar el alias `@/lib/time` a un módulo que se testea con
 * `node --test` pelado.
 */
export function isBackfilledImport(
  booking: ImportedBookingFacts,
  timeZone: string,
): boolean {
  const imported =
    isImportSource(booking.source) || Boolean(booking.importedIcalUid);
  if (!imported) return false;
  // Sin fecha de alta no podemos datarla → conservador: la tratamos como
  // histórica antes que arriesgarnos a meter dinero ajeno en la caja.
  if (!booking.createdAt) return true;
  const createdOn = booking.createdAt.toLocaleDateString('en-CA', { timeZone });
  return booking.date < createdOn;
}
