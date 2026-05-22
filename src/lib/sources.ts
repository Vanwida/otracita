// -----------------------------------------------------------------------------
// Catálogo unificado de fuentes de captación del cliente — single source of
// truth para iconos + labels + tonos del chip "¿De dónde te conoció?".
//
// Cubre AMBOS enums que conviven en el dominio:
//   · ManualSource     (src/lib/attribution/source-manual.ts) — override del
//                      barbero al cerrar cita. Set cerrado: instagram, tiktok,
//                      facebook, google_maps, referral, walk_in.
//   · AttributionSource (src/lib/attribution/types.ts) — atribución pasiva
//                       capturada por UTM/referrer en la PWA. Incluye además:
//                       google_ads, google_organic, youtube, whatsapp_bot,
//                       direct, other.
//
// La unión está abierta para nuevos valores legacy (`first_source` puede
// contener strings antiguos no normalizados); `getSourceMeta()` cae al meta
// `other` cuando el valor no se reconoce.
//
// Consumido por:
//   · BookingDetailPanel        → selector "¿de dónde te conoció?"
//   · SourceChip                → chip de origen en agenda + ficha cliente
//   · SourceBreakdown           → barras /clientes/atribucion
//   · informes/marketing/page   → ranking de origen efectivo
//
// Convención iconos:
//   · Redes sociales → logos de marca oficiales vía react-icons/si.
//   · Resto         → lucide-react (metáforas claras: Footprints walk-in, etc).
// Los SI icons heredan `currentColor` — el chip controla el color con
// tokens del design system, sin hex hardcoded.
// -----------------------------------------------------------------------------

import {
  SiInstagram,
  SiTiktok,
  SiFacebook,
  SiYoutube,
  SiWhatsapp,
  SiGoogle,
  SiGoogleads,
  SiGooglemaps,
} from 'react-icons/si'
import {
  Footprints,
  UserPlus,
  Compass,
  MoreHorizontal,
  Search,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

// Tipo común que cumple tanto IconType de react-icons como LucideIcon. Ambos
// aceptan className + size + props SVG nativos; los pintamos como
// <Icon className="h-4 w-4" />.
export type SourceIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

/** Tono semántico para el fondo del chip. Mapea a tokens del design system
 *  en `SourceChip`. No hex aquí. */
export type SourceTone = 'brand' | 'ok' | 'warn' | 'neutral'

export interface SourceMeta {
  /** Valor canónico (debe coincidir con el string persistido en DB). */
  value: string
  /** Etiqueta human-readable es-ES. */
  label: string
  /** Icono — marca oficial (react-icons/si) para redes; lucide para el resto. */
  Icon: SourceIcon
  /** Tono semántico del chip (mapea a tokens). */
  tone: SourceTone
  /** True si el icono es un logo de marca oficial: el chip puede pintarlo
   *  con `currentColor` para que respete el tono del fondo y nunca
   *  introduzca un hex propietario (#E4405F, #1877F2…) que rompa el theme. */
  brand?: boolean
}

// Meta canónico unificado. Las claves son los `value` exactos del schema
// (ver `bookings.referrer_source`, `bookings.source_manual`,
// `customers.first_source`). Los valores se mantienen en sync con:
//   · MANUAL_SOURCES   (source-manual.ts)
//   · AttributionSource (types.ts)
// Si añades un canal nuevo, hazlo AQUÍ y todos los renderers lo pillan.
const SOURCES: SourceMeta[] = [
  // ── Redes sociales — logos de marca oficiales (react-icons/si).
  { value: 'instagram',      label: 'Instagram',  Icon: SiInstagram as SourceIcon, tone: 'brand',   brand: true },
  { value: 'tiktok',         label: 'TikTok',     Icon: SiTiktok as SourceIcon,    tone: 'brand',   brand: true },
  { value: 'facebook',       label: 'Facebook',   Icon: SiFacebook as SourceIcon,  tone: 'brand',   brand: true },
  { value: 'youtube',        label: 'YouTube',    Icon: SiYoutube as SourceIcon,   tone: 'brand',   brand: true },
  { value: 'whatsapp_bot',   label: 'WhatsApp',   Icon: SiWhatsapp as SourceIcon,  tone: 'ok',      brand: true },

  // ── Google — distintos canales, mismo proveedor. Marca oficial.
  { value: 'google_ads',     label: 'Google Ads', Icon: SiGoogleads as SourceIcon, tone: 'brand',   brand: true },
  { value: 'google_organic', label: 'Google',     Icon: SiGoogle as SourceIcon,    tone: 'ok',      brand: true },
  { value: 'google_maps',    label: 'Google Maps', Icon: SiGooglemaps as SourceIcon, tone: 'ok',    brand: true },

  // ── Resto — lucide-react con metáfora clara.
  //   · referral  → UserPlus  (alguien te trajo un cliente nuevo).
  //   · walk_in   → Footprints (entró por la puerta paseando).
  //   · direct    → Compass   (vino directo, sin canal trazado).
  //   · other     → MoreHorizontal (fallback genérico).
  { value: 'referral',       label: 'Recomendación', Icon: UserPlus as SourceIcon,        tone: 'ok',      brand: false },
  { value: 'walk_in',        label: 'Paseando',      Icon: Footprints as SourceIcon,      tone: 'neutral', brand: false },
  { value: 'direct',         label: 'Directo',       Icon: Compass as SourceIcon,         tone: 'neutral', brand: false },
  { value: 'other',          label: 'Otro',          Icon: MoreHorizontal as SourceIcon,  tone: 'neutral', brand: false },
]

const FALLBACK: SourceMeta = {
  value: 'unknown',
  label: 'Otro',
  Icon: Search as unknown as SourceIcon,
  tone: 'neutral',
  brand: false,
}

const SOURCE_BY_VALUE: Record<string, SourceMeta> = Object.fromEntries(
  SOURCES.map((s) => [s.value, s]),
)

/** Devuelve el meta de un value. Si no se reconoce, cae a `other` (no rompe
 *  para strings legacy que pudieran quedar en `customers.first_source`). */
export function getSourceMeta(value: string | null | undefined): SourceMeta {
  if (!value) return FALLBACK
  return SOURCE_BY_VALUE[value] ?? SOURCE_BY_VALUE.other ?? FALLBACK
}

export { SOURCES, SOURCE_BY_VALUE }
