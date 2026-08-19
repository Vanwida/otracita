import { BUSINESS_TIMEZONE, MS_IN_DAY } from '@/lib/time'

// -----------------------------------------------------------------------------
// Ventana "citas por cerrar" — FUENTE ÚNICA compartida por:
//
//   · el contador de la cabecera de Agenda (`GET /api/dashboard/pending-closures`)
//   · el sweep de red de seguridad del cron (`/api/cron/reminders`), que
//     completa automáticamente lo que se salga de la ventana.
//
// Los dos cortes son EXACTAMENTE complementarios: el cron cierra
// `date < hoy - N` y aquí listamos `hoy - N <= date < hoy`. Es decir, lo
// que ve el barbero es justo todo lo que todavía puede cerrar a mano.
// Si el número vive en dos sitios, en cuanto uno cambie el contador miente.
// -----------------------------------------------------------------------------

/** Días que una cita pasada sobrevive sin cerrar antes de que el cron la dé
 *  por completada. Margen deliberadamente holgado (no 1 día): el barbero
 *  tiene fin de semana real para cerrar sin que el sistema decida por él. */
export const PENDING_CLOSURE_WINDOW_DAYS = 3

export interface PendingClosureWindow {
  /** Hoy (YYYY-MM-DD) en la zona horaria del negocio. */
  todayStr: string
  /** Ayer (YYYY-MM-DD) — la etiqueta más frecuente de la lista. */
  yesterdayStr: string
  /** Primer día INCLUIDO en la ventana: el más antiguo que el cron aún no
   *  ha barrido. */
  fromStr: string
}

/** Calcula la ventana en fechas locales del negocio. `now` es inyectable
 *  para tests; en producción siempre es la hora real. */
export function pendingClosureWindow(now: Date = new Date()): PendingClosureWindow {
  const dayAgo = (offset: number) =>
    new Date(now.getTime() - offset * MS_IN_DAY).toLocaleDateString('en-CA', {
      timeZone: BUSINESS_TIMEZONE,
    })

  return {
    todayStr: dayAgo(0),
    yesterdayStr: dayAgo(1),
    fromStr: dayAgo(PENDING_CLOSURE_WINDOW_DAYS),
  }
}
