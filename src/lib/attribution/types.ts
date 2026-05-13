// -----------------------------------------------------------------------------
// Attribution types — compartidos entre PWA (captura) y backend (persistencia).
//
// Vocabulario:
//   - `source`    : el canal de origen, normalizado. Tabla cerrada para que
//                   las queries de "agrupar por origen" sean estables.
//   - `medium`    : modo de adquisición (cpc, organic, social, referral, none).
//   - `campaign`  : utm_campaign si viene de un anuncio.
//
// La normalización vive en `derive-source.ts`. El payload viaja en el body
// del POST de booking y se guarda tal cual.
// -----------------------------------------------------------------------------

/** Canales normalizados. Cerrado a propósito — añadir uno requiere migrar
 *  los pickers en /dashboard/clientes para que filtre. */
export type AttributionSource =
  | 'instagram'
  | 'google_ads'
  | 'google_organic'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'whatsapp_bot'
  | 'walk_in'
  | 'referral'
  | 'direct'
  | 'other';

export type AttributionMedium =
  | 'cpc'
  | 'organic'
  | 'social'
  | 'referral'
  | 'email'
  | 'none';

export interface Attribution {
  source: AttributionSource;
  medium: AttributionMedium;
  /** utm_campaign normalizado (lowercase, trim, ≤ 80 chars). Null si no
   *  hay anuncio detrás. */
  campaign: string | null;
  /** Cuándo se capturó esta atribución (epoch ms). Para TTL en localStorage
   *  + para guardar el captured_at de first-touch en la DB. */
  capturedAt: number;
}

/** Etiqueta human-readable para mostrar en la UI (chips, donut, filtros). */
export const SOURCE_LABEL: Record<AttributionSource, string> = {
  instagram: 'Instagram',
  google_ads: 'Google Ads',
  google_organic: 'Google',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp_bot: 'WhatsApp',
  walk_in: 'Walk-in',
  referral: 'Recomendación',
  direct: 'Directo',
  other: 'Otro',
};

/** Color del chip por source. Usa tokens del design system — coherente con
 *  el resto del dashboard. */
export const SOURCE_TONE: Record<AttributionSource, 'brand' | 'ok' | 'warn' | 'neutral'> = {
  instagram: 'brand',
  google_ads: 'brand',
  google_organic: 'ok',
  facebook: 'brand',
  tiktok: 'brand',
  youtube: 'brand',
  whatsapp_bot: 'ok',
  walk_in: 'neutral',
  referral: 'ok',
  direct: 'neutral',
  other: 'neutral',
};
