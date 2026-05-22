import type { Attribution, AttributionMedium, AttributionSource } from './types';

// -----------------------------------------------------------------------------
// derive-source — convierte una URL + document.referrer en una Attribution
// normalizada. Reglas (orden de prioridad):
//
//   1. UTM params explícitos en la URL → fuente clara, lo que diga utm_source
//      manda. Si hay utm_medium, lo usamos; si no, derivamos del source.
//   2. gclid / fbclid → indican Google/Meta Ads aunque falten UTMs.
//   3. document.referrer hostname → mapeo conocido (instagram.com, google.com,
//      tiktok.com, etc.) cuando ninguno de los anteriores está.
//   4. Sin nada → 'direct'.
//
// Esta función es PURA. La inyección de localStorage / window vive fuera.
// Eso permite tests deterministas.
// -----------------------------------------------------------------------------

/** Mapeo de utm_source crudo a nuestra enum. Lowercase + trim. */
const UTM_SOURCE_MAP: Record<string, AttributionSource> = {
  // Redes sociales
  instagram: 'instagram',
  ig: 'instagram',
  facebook: 'facebook',
  fb: 'facebook',
  meta: 'facebook',
  tiktok: 'tiktok',
  tt: 'tiktok',
  youtube: 'youtube',
  yt: 'youtube',
  // Buscadores
  google: 'google_organic', // override a google_ads si utm_medium=cpc
  bing: 'google_organic',
  duckduckgo: 'google_organic',
  // Email
  email: 'direct', // sin medium específico
  newsletter: 'direct',
  // Mensajería
  whatsapp: 'whatsapp_bot',
  wa: 'whatsapp_bot',
};

/** Hostnames conocidos → source. */
const REFERRER_HOST_MAP: Array<{ pattern: RegExp; source: AttributionSource; medium: AttributionMedium }> = [
  { pattern: /(^|\.)instagram\.com$/, source: 'instagram', medium: 'social' },
  { pattern: /(^|\.)l\.instagram\.com$/, source: 'instagram', medium: 'social' },
  { pattern: /(^|\.)facebook\.com$/, source: 'facebook', medium: 'social' },
  { pattern: /(^|\.)fb\.com$/, source: 'facebook', medium: 'social' },
  { pattern: /(^|\.)m\.facebook\.com$/, source: 'facebook', medium: 'social' },
  { pattern: /(^|\.)l\.facebook\.com$/, source: 'facebook', medium: 'social' },
  { pattern: /(^|\.)lm\.facebook\.com$/, source: 'facebook', medium: 'social' },
  { pattern: /(^|\.)tiktok\.com$/, source: 'tiktok', medium: 'social' },
  { pattern: /(^|\.)youtube\.com$/, source: 'youtube', medium: 'social' },
  { pattern: /(^|\.)youtu\.be$/, source: 'youtube', medium: 'social' },
  { pattern: /(^|\.)google\./, source: 'google_organic', medium: 'organic' },
  { pattern: /(^|\.)bing\.com$/, source: 'google_organic', medium: 'organic' },
  { pattern: /(^|\.)duckduckgo\.com$/, source: 'google_organic', medium: 'organic' },
];

export interface DeriveSourceInput {
  /** URL completa con search params. Ej: `https://otracita.es/foo?utm_source=instagram&utm_medium=social&utm_campaign=verano`. */
  url: string;
  /** `document.referrer`. Vacío si entrada directa. */
  referrer?: string;
  /** Epoch ms — para tests. */
  now?: number;
}

export function deriveAttribution(input: DeriveSourceInput): Attribution {
  const capturedAt = input.now ?? Date.now();
  let urlObj: URL;
  try {
    urlObj = new URL(input.url);
  } catch {
    return { source: 'direct', medium: 'none', campaign: null, capturedAt };
  }

  const params = urlObj.searchParams;
  const rawSource = (params.get('utm_source') || '').trim().toLowerCase();
  const rawMedium = (params.get('utm_medium') || '').trim().toLowerCase();
  const rawCampaign = (params.get('utm_campaign') || '').trim().toLowerCase().slice(0, 80) || null;
  const hasGclid = params.has('gclid');
  const hasFbclid = params.has('fbclid');

  // 1. UTM source explícito
  if (rawSource && UTM_SOURCE_MAP[rawSource]) {
    let source = UTM_SOURCE_MAP[rawSource];
    // google + cpc → google_ads
    if (source === 'google_organic' && rawMedium === 'cpc') {
      source = 'google_ads';
    }
    const medium = inferMedium(source, rawMedium);
    return { source, medium, campaign: rawCampaign, capturedAt };
  }

  // 2. Click identifiers (Google Ads / Meta Ads)
  if (hasGclid) {
    return { source: 'google_ads', medium: 'cpc', campaign: rawCampaign, capturedAt };
  }
  if (hasFbclid) {
    return { source: 'facebook', medium: 'cpc', campaign: rawCampaign, capturedAt };
  }

  // 3. document.referrer hostname
  if (input.referrer) {
    try {
      const refUrl = new URL(input.referrer);
      // Same-host referrer = direct (otracita -> otracita). No cuenta.
      if (refUrl.hostname === urlObj.hostname) {
        return { source: 'direct', medium: 'none', campaign: null, capturedAt };
      }
      for (const { pattern, source, medium } of REFERRER_HOST_MAP) {
        if (pattern.test(refUrl.hostname)) {
          return { source, medium, campaign: null, capturedAt };
        }
      }
      // Hostname externo no conocido → referral
      return { source: 'referral', medium: 'referral', campaign: null, capturedAt };
    } catch {
      // referrer no parseable, ignoramos
    }
  }

  // 4. Sin nada → direct
  return { source: 'direct', medium: 'none', campaign: null, capturedAt };
}

function inferMedium(source: AttributionSource, rawMedium: string): AttributionMedium {
  // Si el utm_medium es válido, respetarlo
  if (rawMedium === 'cpc' || rawMedium === 'organic' || rawMedium === 'social' ||
      rawMedium === 'referral' || rawMedium === 'email') {
    return rawMedium;
  }
  // Si no, inferir del source
  switch (source) {
    case 'google_ads':
      return 'cpc';
    case 'google_organic':
      return 'organic';
    case 'instagram':
    case 'facebook':
    case 'tiktok':
    case 'youtube':
      return 'social';
    case 'whatsapp_bot':
      return 'referral';
    case 'referral':
      return 'referral';
    default:
      return 'none';
  }
}
