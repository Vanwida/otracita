// -----------------------------------------------------------------------------
// brand-utils — paleta por barbería para la página pública /b/[slug].
//
// Modelo de configuración (estilo Apple):
//   1) Tema: 'light' | 'dark' — decide el fondo/texto base
//   2) Accent: un único color hex — pinta CTAs, estados seleccionados,
//      iconos destacados, todo lo "marca"
//
// Derivados:
//   · accent         — color raw del barbero
//   · accentSoft     — accent a ~10% alpha, para tints de sección y
//                      backgrounds de items seleccionados
//   · accentStrong   — igual al accent, pero expuesto como variable para
//                      bordes/anillos (API simétrica con lo que ya tenía
//                      el código)
//   · accentInk      — negro o blanco auto según luminancia del accent.
//                      Evita "yellow brand + white text" ilegible.
// -----------------------------------------------------------------------------

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgba(0,0,0,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

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

export function getInk(hex: string): '#000000' | '#FFFFFF' {
  return luminance(hex) > 0.55 ? '#000000' : '#FFFFFF'
}

function isValidHex(value: string | null): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export type BrandTheme = 'light' | 'dark'

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
  theme: BrandTheme
  isDark: boolean
  accent: string
  accentSoft: string
  accentStrong: string
  accentInk: string
  tokens: ThemeTokens
}

// ── Tema claro ──────────────────────────────────────────────────────────────
const LIGHT_TOKENS: ThemeTokens = {
  canvas: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  overlay: '#F3F4F6',
  line: '#E5E7EB',
  ink: '#0F0F0F',
  ink2: '#4B5563',
  ink3: '#9CA3AF',
}

// ── Tema oscuro — "bonito dark", no negro puro ──────────────────────────────
// Canvas #0F0F12 (casi negro, ligeramente cálido). Cards un paso arriba.
// Inspirado en la paleta Apple dark mode pero con más calor para ambiente
// barbería.
const DARK_TOKENS: ThemeTokens = {
  canvas: '#0E0E11',
  surface: '#18181C',
  surfaceElevated: '#1F1F24',
  overlay: '#27272C',
  line: '#2E2E34',
  ink: '#FAFAFA',
  ink2: '#B3B3B8',
  ink3: '#6B6B72',
}

function normaliseTheme(value: string | null | undefined): BrandTheme {
  return value === 'dark' ? 'dark' : 'light'
}

export function buildPalette(
  rawTheme: string | null | undefined,
  rawAccent: string | null,
): BrandPalette {
  const theme: BrandTheme = normaliseTheme(rawTheme)
  const isDark = theme === 'dark'
  // Fallback de accent: negro en tema claro (funciona), blanco-ish en oscuro.
  // Forzamos al barbero a elegir uno bueno pero damos fallback razonable.
  const fallbackAccent = isDark ? '#E5C07B' : '#111111'
  const accent = isValidHex(rawAccent) ? rawAccent : fallbackAccent
  return {
    theme,
    isDark,
    accent,
    accentSoft: hexToRgba(accent, isDark ? 0.18 : 0.1),
    accentStrong: accent,
    accentInk: getInk(accent),
    tokens: isDark ? DARK_TOKENS : LIGHT_TOKENS,
  }
}
