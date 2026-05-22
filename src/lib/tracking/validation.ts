// -----------------------------------------------------------------------------
// Tracking pixel validation — single source of truth para regex + labels.
// Importado tanto por el server action (/api/clients/tracking) como por
// el componente cliente (TrackingSettings) → mismo regex, mismo error.
// -----------------------------------------------------------------------------

export const TRACKING_FIELDS = [
  'gtmContainerId',
  'metaPixelId',
  'googleAdsConversionId',
  'googleAdsConversionLabel',
  'tiktokPixelId',
] as const

export type TrackingField = (typeof TRACKING_FIELDS)[number]

/** Regex de validación — case-insensitive donde aplique (i flag) salvo el
 *  label de Google Ads, que es case-sensitive porque Google lo trata así. */
export const TRACKING_REGEX: Record<TrackingField, RegExp> = {
  gtmContainerId: /^GTM-[A-Z0-9]{6,12}$/i,
  metaPixelId: /^\d{15,16}$/,
  googleAdsConversionId: /^AW-\d+$/i,
  googleAdsConversionLabel: /^[A-Za-z0-9_-]+$/,
  tiktokPixelId: /^[A-Z0-9]{20}$/i,
}

/** Etiqueta humana para errores y UI. */
export const TRACKING_LABELS: Record<TrackingField, string> = {
  gtmContainerId: 'Google Tag Manager',
  metaPixelId: 'Meta Pixel',
  googleAdsConversionId: 'Google Ads ID',
  googleAdsConversionLabel: 'Google Ads label',
  tiktokPixelId: 'TikTok Pixel',
}

/** Placeholder de formato esperado en los inputs. */
export const TRACKING_PLACEHOLDERS: Record<TrackingField, string> = {
  gtmContainerId: 'GTM-ABC1234',
  metaPixelId: '1234567890123456',
  googleAdsConversionId: 'AW-1234567890',
  googleAdsConversionLabel: 'AbCdEfGhIj-K',
  tiktokPixelId: 'C1234567890ABCDEFGHI',
}

/** Mensaje de error human-readable para cada campo cuando el formato falla. */
export const TRACKING_FORMAT_ERROR: Record<TrackingField, string> = {
  gtmContainerId:
    'Formato GTM-XXXXXX (entre 6 y 12 caracteres alfanuméricos).',
  metaPixelId: 'Debe ser un número de 15 o 16 dígitos (sin guiones ni espacios).',
  googleAdsConversionId:
    'Formato AW-XXXXXXXXXX. Lo encuentras en Google Ads → Herramientas → Conversiones.',
  googleAdsConversionLabel:
    'Solo letras, números, guion bajo o guion. Sin espacios.',
  tiktokPixelId: '20 caracteres alfanuméricos en mayúscula (lo verás en TikTok Ads).',
}

/** Normaliza input antes de validar (trim + upper, salvo label). */
export function normalizeTrackingValue(field: TrackingField, raw: string): string {
  const trimmed = raw.trim()
  return field === 'googleAdsConversionLabel' ? trimmed : trimmed.toUpperCase()
}

/** Valida un único campo. Devuelve null si OK, mensaje si error. */
export function validateTrackingField(
  field: TrackingField,
  value: string,
): string | null {
  if (value.length === 0) return null // vacío = limpiar, válido
  if (!TRACKING_REGEX[field].test(value)) return TRACKING_FORMAT_ERROR[field]
  return null
}
