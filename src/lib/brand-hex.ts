// -----------------------------------------------------------------------------
// brand-hex — colores otracita en hex literal.
//
// Existen porque hay APIs externas que NO entienden `var(--color-*)`:
//   · Librería QR (`qrcode`) — `color: { dark, light }` necesita hex
//   · `<input type="color">` value default — necesita hex
//   · Color pickers (react-colorful etc.) — bindeados a hex
//
// MANTENER SINCRONIZADO con `globals.css` → @theme. Si cambia el brand
// terracota allí, cambiarlo aquí. Idealmente sólo dos sitios; si un día
// migra a build-time tokens compartidos (PostCSS plugin) este fichero
// desaparece.
// -----------------------------------------------------------------------------

/** Terracota — = `--color-brand`. Fallback para el QR/PWA del cliente
 *  cuando no ha elegido brandColor propio. */
export const BRAND_TERRACOTA_HEX = '#C9653C'

/** Espresso — = `--color-ink`. Fallback "oscuro" para el QR cuando se
 *  necesita máxima legibilidad y el cliente no eligió brandColor. PRODUCT.md
 *  prohíbe `#000` puro — usamos el espresso tinted. */
export const BRAND_INK_HEX = '#2A1D14'

/** Blanco puro — único caso permitido por PRODUCT.md ("no `#fff` salvo
 *  contextos donde sea funcional"): el QR generator necesita blanco puro
 *  como background para máximo contraste de escaneo. NO usar como
 *  superficie UI — para eso `--color-surface` (también blanco puro pero
 *  semánticamente nombrado). */
export const QR_WHITE_HEX = '#FFFFFF'

// ─── Presets de tema de la PWA pública del barbero ──────────────────────────
//
// Son DATA del cliente (se guardan en `clients.brandTheme` = 'light' | 'dark')
// y se pintan inline en la PWA white-label (`/b/[slug]`). NO son tokens del
// producto otracita — la PWA pública es del barbero, no nuestra. Hex porque
// se pasan a `style={{ background, color, border }}` y a previews del editor.
//
// Distintos del cream/espresso del dashboard otracita:
//   · cream PWA `#FAFAF7` > `--color-canvas` `#F7F3EE` (más blanco, menos warm)
//   · ink  PWA `#0F0F0F` ≠ `--color-ink`    `#2A1D14` (PWA puede ir más negro
//     porque el cliente final no tiene la convención workwear-warm)
export const PUBLIC_PWA_THEME = {
  light: {
    bg: '#FAFAF7',
    ink: '#0F0F0F',
    /** Borde sutil del card preview en el editor del dashboard. */
    border: '#E5E7EB',
  },
  dark: {
    bg: '#18181C',
    ink: '#FAFAFA',
    /** Fondo del scroll-area cuando el editor previsualiza modo dark. */
    editorPreviewBg: '#0A0A0B',
  },
} as const
