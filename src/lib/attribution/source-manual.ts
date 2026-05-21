// -----------------------------------------------------------------------------
// F3 Reni — Selector de origen al cierre de cita (override manual).
//
// Conjunto cerrado de canales que el barbero puede marcar al cerrar la cita
// preguntándole al cliente "¿de dónde me conociste?". Convive con la
// atribución pasiva (UTM/referrer en bookings.referrer_source + customer
// first-touch en clients.first_source) y la GANA en reporting cuando está set:
//
//   effective_source := COALESCE(bookings.source_manual, derived_from_referrer)
//
// Si el barbero no marca nada, queda la pasiva. Si marca y luego desmarca,
// `source_manual` vuelve a NULL y la pasiva re-asume el control.
//
// Mantener en sync con:
//   · src/db/schema.ts (bookings.sourceManual)
//   · src/app/api/bookings/[id]/route.ts (PATCH validation)
//   · src/app/dashboard/agenda/BookingDetailPanel.tsx (selector UI)
// -----------------------------------------------------------------------------

export type ManualSource =
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'google_maps'
  | 'referral'
  | 'walk_in';

export const MANUAL_SOURCES: readonly ManualSource[] = [
  'instagram',
  'tiktok',
  'facebook',
  'google_maps',
  'referral',
  'walk_in',
] as const;

export function isManualSource(v: unknown): v is ManualSource {
  return typeof v === 'string' && (MANUAL_SOURCES as readonly string[]).includes(v);
}

/** Etiqueta human-readable corta para tooltips y reportes. */
export const MANUAL_SOURCE_LABEL: Record<ManualSource, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  google_maps: 'Google Maps',
  referral: 'Recomendación',
  walk_in: 'Walk-in',
};
