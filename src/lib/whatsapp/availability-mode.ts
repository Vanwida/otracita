/**
 * Cómo resuelve un tenant su disponibilidad: contra la DB (motor propio,
 * `src/lib/availability.ts`) o contra Google Calendar (legacy).
 *
 * Módulo aparte y SIN dependencias (ni db, ni fetch) a propósito: el engine
 * de WhatsApp lo consulta en dos puntos distintos del flujo de reserva y
 * necesitamos poder testear la decisión sin levantar Postgres.
 */

export interface AvailabilityModeConfig {
  /** Feature flag `clients.use_db_availability`. Default del schema: true. */
  useDbAvailability: boolean;
  /** Calendario de Google del tenant (solo tenants legacy lo tienen). */
  googleCalendarId?: string;
}

/**
 * ¿Puede este tenant atender el flujo de reserva del bot?
 *
 * Un alta por el wizard (`/api/setup`) NUNCA tiene `googleCalendarId`: su
 * única vía es el motor de DB. Antes esto se comprobaba solo contra
 * `googleCalendarId`, así que las altas nuevas caían en el mensaje de
 * "integración con calendario en proceso" y nunca llegaban a elegir día.
 */
export function canServeBookingFlow(config: AvailabilityModeConfig): boolean {
  return config.useDbAvailability || !!config.googleCalendarId;
}
