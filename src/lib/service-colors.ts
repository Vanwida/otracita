// -----------------------------------------------------------------------------
// service-colors — paleta saturada Booksy/Fresha-style para servicios.
//
// El barbero elige uno de 12 tokens al crear/editar un servicio O un hex
// personalizado (chip "Personalizado" → `<input type="color">`). El bloque de
// cita en la agenda se pinta con ese color como fondo y el texto se calcula
// automáticamente (claro/oscuro) según la luminancia del fondo.
//
// Por qué saturada y no pastel:
//  · La cita es un bloque pequeño en una rejilla densa. Pasteles light+warm
//    (paleta anterior, 21 tokens) eran ilegibles entre sí — el barbero
//    necesitaba distinguir "tinte" de "corte" de un vistazo y no podía.
//  · El chrome del UI sigue light+warm (Patagonia). Esta paleta SATURADA es
//    exclusiva del fondo del bloque cita — un acento puntual sobre canvas
//    cream, no domina la pantalla.
//
// Por qué 12 colores fijos + custom:
//  · 12 cubre todo el círculo cromático sin solaparse (hues separados ~30°).
//  · El custom hex resuelve el caso "ninguno de los 12 me sirve para mi
//    branding" sin meter una librería externa: HTML5 `<input type="color">`.
//
// Por qué nombres abstractos (red/olive/blue) en vez de funcionales: los
// servicios varían por negocio. Imponer una taxonomía encajonaría al barbero.
// -----------------------------------------------------------------------------

export const SERVICE_COLOR_TOKENS = [
  'red',
  'orange',
  'amber',
  'olive',
  'green',
  'emerald',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'slate',
] as const

export type ServiceColorToken = (typeof SERVICE_COLOR_TOKENS)[number]

/**
 * Color por defecto cuando un servicio no tiene `colorToken` (o es inválido).
 * Alineado con la brand (slate = neutro de soporte, no pisa la identidad
 * terracota del chrome al estar saturado).
 */
export const DEFAULT_SERVICE_COLOR: ServiceColorToken = 'slate'

/** Type guard estricto para los 12 tokens canónicos. NO valida hex custom. */
export function isServiceColorToken(v: unknown): v is ServiceColorToken {
  return typeof v === 'string' && (SERVICE_COLOR_TOKENS as readonly string[]).includes(v)
}

/** Valida que `v` sea un hex `#RRGGBB` en minúsculas (formato canónico que
 *  guardamos). Acepta también mayúsculas — el caller debe normalizar antes
 *  de persistir, pero al leer toleramos ambas. */
export function isCustomHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
}

/** Valida que `v` sea o bien un token de la paleta o bien un hex custom. */
export function isValidServiceColor(v: unknown): v is ServiceColorToken | string {
  return isServiceColorToken(v) || isCustomHex(v)
}

/**
 * Devuelve un valor de color siempre válido. Si la entrada es token o hex
 * válido, lo devuelve tal cual (normalizando hex a minúsculas). Si no,
 * devuelve el por defecto.
 */
export function normalizeServiceColor(v: unknown): ServiceColorToken | string {
  if (isServiceColorToken(v)) return v
  if (isCustomHex(v)) return (v as string).toLowerCase()
  return DEFAULT_SERVICE_COLOR
}

/**
 * Mapa token → clases Tailwind. Cada entrada expone un par {bg, ink, border,
 * ring}. El ink ya viene calculado por luminancia (ver `SERVICE_COLOR_TEXT`).
 *
 * Los CSS vars detrás están declarados en `src/app/globals.css` (@theme).
 * Tailwind v4 los transforma en utilities automáticamente.
 */
export const SERVICE_COLOR_CLASSES: Record<
  ServiceColorToken,
  { bg: string; ink: string; border: string; ring: string }
> = {
  red: {
    bg: 'bg-svc-red',
    ink: 'text-on-svc-light',
    border: 'border-svc-red',
    ring: 'ring-svc-red',
  },
  orange: {
    bg: 'bg-svc-orange',
    ink: 'text-on-svc-light',
    border: 'border-svc-orange',
    ring: 'ring-svc-orange',
  },
  amber: {
    bg: 'bg-svc-amber',
    ink: 'text-on-svc-dark',
    border: 'border-svc-amber',
    ring: 'ring-svc-amber',
  },
  olive: {
    bg: 'bg-svc-olive',
    ink: 'text-on-svc-light',
    border: 'border-svc-olive',
    ring: 'ring-svc-olive',
  },
  green: {
    bg: 'bg-svc-green',
    ink: 'text-on-svc-light',
    border: 'border-svc-green',
    ring: 'ring-svc-green',
  },
  emerald: {
    bg: 'bg-svc-emerald',
    ink: 'text-on-svc-light',
    border: 'border-svc-emerald',
    ring: 'ring-svc-emerald',
  },
  cyan: {
    bg: 'bg-svc-cyan',
    ink: 'text-on-svc-dark',
    border: 'border-svc-cyan',
    ring: 'ring-svc-cyan',
  },
  blue: {
    bg: 'bg-svc-blue',
    ink: 'text-on-svc-light',
    border: 'border-svc-blue',
    ring: 'ring-svc-blue',
  },
  indigo: {
    bg: 'bg-svc-indigo',
    ink: 'text-on-svc-light',
    border: 'border-svc-indigo',
    ring: 'ring-svc-indigo',
  },
  purple: {
    bg: 'bg-svc-purple',
    ink: 'text-on-svc-light',
    border: 'border-svc-purple',
    ring: 'ring-svc-purple',
  },
  pink: {
    bg: 'bg-svc-pink',
    ink: 'text-on-svc-light',
    border: 'border-svc-pink',
    ring: 'ring-svc-pink',
  },
  slate: {
    bg: 'bg-svc-slate',
    ink: 'text-on-svc-light',
    border: 'border-svc-slate',
    ring: 'ring-svc-slate',
  },
}

/**
 * Etiqueta humana del color. Usada como `aria-label` del chip y title tooltip.
 */
export const SERVICE_COLOR_LABELS: Record<ServiceColorToken, string> = {
  red: 'Rojo',
  orange: 'Naranja',
  amber: 'Ámbar',
  olive: 'Oliva',
  green: 'Verde',
  emerald: 'Esmeralda',
  cyan: 'Cian',
  blue: 'Azul',
  indigo: 'Índigo',
  purple: 'Púrpura',
  pink: 'Rosa',
  slate: 'Pizarra',
}

/**
 * Luminancia (OKLCH L aproximada) de cada token. Sirve para que tests y
 * consumidores externos sepan qué texto va encima sin parsear el CSS.
 * Valores alineados con los `oklch(L ...)` del @theme en globals.css.
 */
export const SERVICE_COLOR_LIGHTNESS: Record<ServiceColorToken, number> = {
  // red sentado justo en boundary 0.6 → bajamos a 0.58 porque a chroma 0.21
  // el rojo se PERCIBE más oscuro que su L OKLCH puro indica; texto blanco
  // es la elección Booksy/Fresha para rojo saturado.
  red: 0.58,
  orange: 0.68,
  amber: 0.78,
  olive: 0.55,
  // green sentado en 0.65 con chroma alto se PERCIBE en boundary; lo
  // marcamos como medio para forzar texto claro (consistencia visual con
  // emerald/blue del mismo lado de la rueda).
  green: 0.59,
  emerald: 0.59,
  cyan: 0.68,
  blue: 0.55,
  indigo: 0.5,
  purple: 0.55,
  // pink saturado a chroma 0.22 se PERCIBE oscuro; texto claro como Booksy.
  pink: 0.59,
  slate: 0.55,
}

/**
 * Boundary luminancia para decidir texto sobre el bloque cita.
 *  · L < 0.6  → fondo OSCURO/medio → texto claro (warm-near-white).
 *  · L ≥ 0.6 → fondo CLARO → texto oscuro (ink-2 cálido).
 * Boundary calibrado contra AA WCAG: con un texto warm-near-white sobre
 * fondos OKLCH L≤0.59 (chroma≈0.18) y texto ink-cálido sobre L≥0.60 sale
 * ratio ≥ 4.5 en todos los pares de la paleta.
 */
const LUMINANCE_BOUNDARY = 0.6

/**
 * Decide si el texto sobre un fondo de luminancia dada debe ser claro u
 * oscuro. Boundary inclusivo en `dark` (L = 0.6 → dark).
 */
export function pickTextColor(bgOklchL: number): 'light' | 'dark' {
  return bgOklchL < LUMINANCE_BOUNDARY ? 'light' : 'dark'
}

/**
 * Mapa token → 'light' | 'dark' (text color computed por luminancia). Sirve
 * para el render — los componentes leen este mapa en vez de calcular el
 * pickTextColor() en cada render.
 */
export const SERVICE_COLOR_TEXT: Record<ServiceColorToken, 'light' | 'dark'> =
  Object.fromEntries(
    SERVICE_COLOR_TOKENS.map((t) => [t, pickTextColor(SERVICE_COLOR_LIGHTNESS[t])]),
  ) as Record<ServiceColorToken, 'light' | 'dark'>

/**
 * Convierte un hex `#RRGGBB` a luminancia perceptual normalizada (0-1)
 * aproximada a OKLCH L. Usa CIE L* (Lab lightness) sobre la Y de WCAG
 * Rec.709 — lo más cerca de OKLCH L sin instalar una librería de conversión.
 *
 * Pipeline:
 *   1. sRGB → linear (gamma piecewise WCAG 2.x exacto).
 *   2. Y = 0.2126·Rl + 0.7152·Gl + 0.0722·Bl (luminancia relativa WCAG).
 *   3. Lstar = 116·f(Y) - 16, con f(t) = t^(1/3) si t > (6/29)^3 else
 *      (1/3)·(29/6)^2·t + 4/29.
 *   4. Lstar dividido entre 100 cae en [0..1], compatible con la frontera 0.6 que usamos.
 *
 * Anchors verificados:
 *   · #000000 → 0
 *   · #ffffff → 1
 *   · #1E88E5 (Booksy blue, OKLCH L ≈ 0.55) → Lstar ≈ 0.56 (< 0.6 → claro)
 *   · #FFC107 (Booksy amber, OKLCH L ≈ 0.83) → Lstar ≈ 0.82 (≥ 0.6 → oscuro)
 *
 * Devuelve `null` si el hex es inválido (defensa — el caller ya valida con
 * `isCustomHex`, pero no asumimos).
 */
export function hexLuminance(hex: string): number | null {
  if (!isCustomHex(hex)) return null
  const h = hex.slice(1)
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  // sRGB → linear (gamma piecewise, WCAG 2.x exacto).
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  // Y → L* (CIE Lab lightness, curva perceptual que aproxima OKLCH L).
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116
  const Lstar = 116 * f(Y) - 16
  return Lstar / 100
}

/**
 * Para un valor de color (token o hex), devuelve si el texto encima debe
 * ser claro u oscuro. Si el input es inválido, asume el default.
 */
export function pickTextColorFor(value: unknown): 'light' | 'dark' {
  if (isServiceColorToken(value)) return SERVICE_COLOR_TEXT[value]
  if (isCustomHex(value)) {
    const L = hexLuminance(value as string)
    return L === null ? 'light' : pickTextColor(L)
  }
  return SERVICE_COLOR_TEXT[DEFAULT_SERVICE_COLOR]
}
