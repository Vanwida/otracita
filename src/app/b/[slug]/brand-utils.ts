// -----------------------------------------------------------------------------
// brand-utils — paleta derivada por barbería para la página pública /b/[slug].
//
// El barbero configura 1 color principal (obligatorio) y opcionalmente un
// secundario. Desde ahí derivamos TODO lo que el diseño necesita, incluido
// si el tema base tira a claro o a oscuro (según luminancia del principal).
//
//   · brand            — color raw del barbero
//   · brand2           — secundario configurado o derivado (-28% brillo)
//   · brandSoft        — brand a 9% alpha, para tintar secciones
//   · brand2Soft       — brand2 a 20% alpha, halos
//   · brandStrong      — el más oscuro de los dos, para bordes/anillos
//                        legibles cuando el principal es muy claro
//   · brandInk         — negro o blanco auto, para texto sobre CTAs
//                        con fondo brand
//   · isDark           — true si el color principal es oscuro (luminancia
//                        < 0.5). Determina toda la paleta de superficie.
//   · theme            — tokens de superficie adaptados (canvas, surface,
//                        ink, ink-2, ink-3, line, overlay). Un principal
//                        negro/navy → UI oscura tipo Stitch; un principal
//                        pastel → UI clara.
// -----------------------------------------------------------------------------

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(0,0,0,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Mezcla hex con negro (amount < 0) o blanco (amount > 0). */
export function shadeHex(hex: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const mix = amount < 0 ? 0 : 255
  const t = Math.abs(amount)
  const mr = Math.round(r + (mix - r) * t)
  const mg = Math.round(g + (mix - g) * t)
  const mb = Math.round(b + (mix - b) * t)
  return '#' + [mr, mg, mb].map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Luminancia relativa WCAG — 0 (negro) a 1 (blanco). */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = toLinear((n >> 16) & 255)
  const g = toLinear((n >> 8) & 255)
  const b = toLinear(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * '#000000' o '#FFFFFF' según qué se lea mejor sobre el color dado.
 * Umbral 0.55: colores más claros que un gris neutro (amarillo, pastel)
 * devuelven tinta negra; marrones/navy/burdeos devuelven blanca.
 */
export function getInk(hex: string): '#000000' | '#FFFFFF' {
  return luminance(hex) > 0.55 ? '#000000' : '#FFFFFF'
}

function isValidHex(value: string | null): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export interface ThemeTokens {
  canvas: string
  surface: string
  surfaceElevated: string
  overlay: string
  line: string
  ink: string
  ink2: string
  ink3: string
}

export interface BrandPalette {
  brand: string
  brand2: string
  brandSoft: string
  brand2Soft: string
  brandStrong: string
  brandInk: string
  isDark: boolean
  theme: ThemeTokens
}

// Tokens para UI clara (barbero elige color claro/medio).
const LIGHT_THEME: ThemeTokens = {
  canvas: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  overlay: '#F3F4F6',
  line: '#E5E7EB',
  ink: '#0F0F0F',
  ink2: '#4B5563',
  ink3: '#9CA3AF',
}

// Tokens para UI oscura (barbero elige color oscuro tipo negro/navy/burdeos).
// Paleta tipo "Luxe Cuts": fondo casi-negro con toques un poco más claros
// para cards. El ink principal es blanco; ink2/ink3 son grises.
const DARK_THEME: ThemeTokens = {
  canvas: '#0A0A0B',
  surface: '#141416',
  surfaceElevated: '#1C1C1F',
  overlay: '#222226',
  line: '#2B2B30',
  ink: '#FAFAFA',
  ink2: '#B5B5BB',
  ink3: '#6B6B72',
}

export function buildPalette(rawBrand: string | null, rawBrand2: string | null): BrandPalette {
  const brand = isValidHex(rawBrand) ? rawBrand : '#111111'
  const brand2 = isValidHex(rawBrand2) ? rawBrand2 : shadeHex(brand, -0.28)
  const brandStrong = luminance(brand) < luminance(brand2) ? brand : brand2
  // Umbral 0.5: por debajo consideramos el principal "oscuro" y pintamos
  // toda la UI en oscuro. Por encima, la UI va clara (el accent sigue
  // siendo el principal vibrante, en CTAs y bordes seleccionados).
  const isDark = luminance(brand) < 0.5
  return {
    brand,
    brand2,
    brandSoft: hexToRgba(brand, isDark ? 0.18 : 0.09),
    brand2Soft: hexToRgba(brand2, 0.2),
    brandStrong,
    brandInk: getInk(brand),
    isDark,
    theme: isDark ? DARK_THEME : LIGHT_THEME,
  }
}
