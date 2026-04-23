// -----------------------------------------------------------------------------
// brand-utils — paleta derivada por barbería para la página pública /b/[slug].
//
// La barbería configura 1 color (obligatorio) y opcionalmente un segundo.
// Desde ahí derivamos TODO lo que el diseño necesita:
//   · brand         — color raw del barbero
//   · brand2        — secundario configurado o derivado (-28% brillo)
//   · brandSoft     — brand a 9% alpha, para tintar secciones
//   · brandStrong   — el más oscuro de los dos, para bordes/anillos legibles
//                     cuando el principal es muy claro (amarillo, lima, pastel)
//   · brandInk      — blanco o negro automáticamente según luminancia del
//                     brand, para que el texto sobre CTAs siempre se lea
//                     (crítico: un barbero con amarillo no quiere texto blanco)
//
// Todo se inyecta en <main> como CSS vars — los hijos usan var(--brand) etc.
// sin recomputar nada.
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
 * Devuelve '#000000' o '#FFFFFF' según qué se lea mejor sobre el color dado.
 * Umbral 0.55: colores más claros que un gris neutro (amarillo, pastel)
 * devuelven tinta negra; marrones/navy/burdeos devuelven blanca.
 */
export function getInk(hex: string): '#000000' | '#FFFFFF' {
  return luminance(hex) > 0.55 ? '#000000' : '#FFFFFF'
}

function isValidHex(value: string | null): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export interface BrandPalette {
  brand: string
  brand2: string
  brandSoft: string
  brandStrong: string
  brandInk: string
  /** Sombra de acento — brand-2 a 20% alpha, para halos suaves. */
  brand2Soft: string
}

export function buildPalette(rawBrand: string | null, rawBrand2: string | null): BrandPalette {
  const brand = isValidHex(rawBrand) ? rawBrand : '#111111'
  const brand2 = isValidHex(rawBrand2) ? rawBrand2 : shadeHex(brand, -0.28)
  const brandStrong = luminance(brand) < luminance(brand2) ? brand : brand2
  return {
    brand,
    brand2,
    brandSoft: hexToRgba(brand, 0.09),
    brand2Soft: hexToRgba(brand2, 0.2),
    brandStrong,
    brandInk: getInk(brand),
  }
}
