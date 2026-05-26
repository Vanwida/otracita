// -----------------------------------------------------------------------------
// Types para la lista de espera por slot específico (#88).
//
// Convive con el flujo legacy del bot (engine.ts), que solo usa
// `customerPhone`, `date`, `time=null`, `barber` libre. Estos types describen
// SOLO el flujo nuevo: cliente PWA/dashboard pulsa "avísame si se libera" sobre
// un slot concreto → entra con rango deseado + barberId canónico + expiración.
// -----------------------------------------------------------------------------

import type { waitlist } from '@/db/schema'

export type WaitlistRow = typeof waitlist.$inferSelect
export type WaitlistInsert = typeof waitlist.$inferInsert

/** Status conocidos. El bot legacy usa 'waiting' | 'notified' | 'booked' | 'expired';
 *  el flujo #88 añade 'converted' (se materializó como booking) y 'cancelled'
 *  (el cliente o el admin la sacó). */
export type WaitlistStatus =
  | 'waiting'
  | 'notified'
  | 'booked'
  | 'converted'
  | 'expired'
  | 'cancelled'

/** Ventana mínima (en minutos) entre "ahora" y el inicio del slot para que
 *  AVISAR tenga sentido. Si la cancelación llega a 5 min del slot, el aviso
 *  llegaría con el cliente ya buscando otra opción → mejor no notificar.
 *  Sólo aplica al flujo #88; el bot legacy no usa este umbral. */
export const WAITLIST_NOTIFY_LEAD_MIN_MINUTES = 30

/** Tiempo (minutos) que damos al primer notificado para aceptar antes de pasar
 *  al siguiente. Mantenemos el mismo valor que el bot legacy
 *  (`notifyWaitlist` en engine.ts) para que el comportamiento se sienta
 *  consistente: 30 min. */
export const WAITLIST_NOTIFICATION_GRACE_MINUTES = 30
