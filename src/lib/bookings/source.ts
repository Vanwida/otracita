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
