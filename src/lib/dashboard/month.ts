// -----------------------------------------------------------------------------
// month.ts — helpers de MES discreto (YYYY-MM) para superficies fiscales
// (P&L mensual, nóminas). Vive junto a `period.ts` (que cubre los rangos
// rolling day/week/month/year/lifetime); este módulo cubre el mes-calendario
// indivisible que necesitan nómina e IVA.
//
// Existía triplicado inline (FinanzasClient, informes/page.tsx,
// informes/nominas/page.tsx). Tres copias = umbral de extracción (regla DRY
// del proyecto). FUENTE ÚNICA: parsear, navegar y formatear un mes.
//
// Sin imports de `@/` ⇒ ejecuta bajo `node --test` como el resto de
// lógica pura del proyecto.
// -----------------------------------------------------------------------------

/** Mes actual en zona Europe/Madrid como `YYYY-MM`. */
export function currentMonthMadrid(): string {
  const iso = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Madrid',
  })
  return iso.slice(0, 7)
}

/** `true` si la cadena tiene forma `YYYY-MM`. */
export function isValidMonth(raw: string | undefined | null): raw is string {
  return typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)
}

/** Valida un mes recibido por query; cae al mes Madrid si es inválido. */
export function parseMonth(raw: string | undefined | null): string {
  return isValidMonth(raw) ? raw : currentMonthMadrid()
}

/** Mes anterior (`2026-01` → `2025-12`). */
export function prevMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 1) return `${year - 1}-12`
  return `${year}-${String(mon - 1).padStart(2, '0')}`
}

/** Mes siguiente (`2026-12` → `2027-01`). */
export function nextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 12) return `${year + 1}-01`
  return `${year}-${String(mon + 1).padStart(2, '0')}`
}

/** Etiqueta larga en español: `2026-05` → `"mayo de 2026"`. */
export function formatMonthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const date = new Date(year, mon - 1, 1)
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}
