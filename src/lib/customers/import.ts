// -----------------------------------------------------------------------------
// Customer CSV import — pure helpers.
//
// Por qué este módulo: el onboarding crítico de un barbero que viene de
// Booksy/Treatwell/Fresha es traer su base de clientes. Si lo metiera a mano
// no lo haría, y otracita se quedaría vacía sin historial. Aquí vive la
// lógica determinista para validar y deduplicar filas ANTES de tocar la DB
// — el endpoint solo orquesta y persiste.
//
// Reglas duras:
//
//   · Teléfono es el ID único del cliente dentro del tenant. Sin teléfono →
//     skip (no podemos hacer match, ni mandar recordatorios ni follow-up).
//   · Teléfonos se normalizan SIEMPRE a E.164 con canonicalizePhone — única
//     fuente para no fragmentar la misma persona en 3 filas (foot-gun en
//     CLAUDE.md). Inválido (no parseable) → skip + razón.
//   · Dedupe por (clientId, phone) con la lista de existentes en DB. Si ya
//     existe y el nombre actual está vacío y el CSV trae uno → UPDATE solo
//     nombre. Resto → skip silencioso (counter `updated` vs `skipped`).
//
// Estos helpers son puros (sin DB, sin I/O). El caller (API route) hace el
// SELECT inicial de existentes y los INSERT/UPDATE secuenciales — neon-http
// NO soporta `db.transaction`, así que el endpoint maneja fallo parcial
// devolviendo lo que llevamos hecho.
// -----------------------------------------------------------------------------

import { canonicalizePhone } from '../phone.ts'

/** Lo que el cliente sube tras parsear el CSV. Todo opcional menos `phone`. */
export interface ImportRow {
  name?: string | null
  phone: string
  email?: string | null
  notas?: string | null
}

/** Una fila normalizada y clasificada — el preview consume estas filas. */
export type ImportRowStatus =
  | { kind: 'ok'; phone: string; name: string | null; email: string | null; notas: string | null }
  | { kind: 'duplicate'; phone: string; name: string | null; email: string | null; notas: string | null }
  | { kind: 'invalid_phone'; reason: 'no_phone' | 'unparseable'; rawPhone: string; name: string | null; email: string | null; notas: string | null }

/** Una fila tal como existe en DB para hacer dedupe — solo lo mínimo. */
export interface ExistingCustomer {
  phone: string
  name: string | null
}

/** Resumen agregado del preview (lo que se muestra debajo de la tabla). */
export interface ImportSummary {
  total: number
  ok: number
  duplicates: number
  invalid: number
  toUpdate: number    // duplicados que VAMOS a tocar (name empty + csv name)
}

// -----------------------------------------------------------------------------
// Tamaño máximo de batch — endurecido aquí y validado de nuevo en el endpoint.
// 5000 filas es generoso para un barbero (los más grandes en Booksy tienen
// 2-3k). Por encima de eso, parte el CSV.
// -----------------------------------------------------------------------------
export const IMPORT_ROW_LIMIT = 5000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Normaliza un email: trim + lowercase. Vacío o no-plausible → null.
 *
 * No tira al suelo si el email tiene una forma rara — un email malo es peor
 * que ningún email, pero un email inválido en el CSV NO es razón para skipear
 * toda la fila (el cliente puede ser válido aunque su email no lo sea).
 */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  if (trimmed.length > 254) return null
  if (!EMAIL_RE.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/** Trim + colapsa vacío a null. Usado para nombre y notas (campos opcionales). */
function nullableTrim(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * Clasifica una fila del CSV. Pure — no toca DB. El caller compone la lista
 * de existentes con un SELECT y la pasa aquí para que el preview sepa
 * cuáles son nuevos vs duplicados ANTES de que el barbero pulse Importar.
 *
 *   · phone vacío  → invalid_phone:'no_phone' (no podemos hacer match)
 *   · phone no parseable → invalid_phone:'unparseable'
 *   · phone E.164 ya en `existingByPhone` → duplicate
 *   · resto → ok
 */
export function classifyRow(
  row: ImportRow,
  existingByPhone: Map<string, ExistingCustomer>,
): ImportRowStatus {
  const name = nullableTrim(row.name)
  const email = normalizeEmail(row.email)
  const notas = nullableTrim(row.notas)
  const rawPhone = (row.phone ?? '').trim()

  if (!rawPhone) {
    return { kind: 'invalid_phone', reason: 'no_phone', rawPhone: '', name, email, notas }
  }

  const canon = canonicalizePhone(rawPhone)
  if (!canon.valid) {
    return { kind: 'invalid_phone', reason: 'unparseable', rawPhone, name, email, notas }
  }

  if (existingByPhone.has(canon.value)) {
    return { kind: 'duplicate', phone: canon.value, name, email, notas }
  }

  return { kind: 'ok', phone: canon.value, name, email, notas }
}

/**
 * Clasifica todas las filas y produce el resumen. El preview de la página
 * consume directamente este output (tabla + contadores).
 *
 * `toUpdate` cuenta los duplicados donde el customer en DB tiene `name=null`
 * y el CSV trae un nombre — el barbero verá "X duplicados (Y se
 * actualizarán)" en el preview.
 */
export function classifyRows(
  rows: ImportRow[],
  existing: ExistingCustomer[],
): { rows: ImportRowStatus[]; summary: ImportSummary } {
  const existingByPhone = new Map<string, ExistingCustomer>()
  for (const e of existing) existingByPhone.set(e.phone, e)

  const classified = rows.map((r) => classifyRow(r, existingByPhone))

  let ok = 0
  let duplicates = 0
  let invalid = 0
  let toUpdate = 0
  for (const r of classified) {
    if (r.kind === 'ok') ok++
    else if (r.kind === 'invalid_phone') invalid++
    else {
      duplicates++
      const current = existingByPhone.get(r.phone)
      if (current && (current.name ?? '').trim().length === 0 && (r.name ?? '').length > 0) {
        toUpdate++
      }
    }
  }

  return {
    rows: classified,
    summary: { total: rows.length, ok, duplicates, invalid, toUpdate },
  }
}

/**
 * Decide qué hacer con un duplicado: si el customer existente no tiene
 * nombre y el CSV trae uno, devuelve el nombre nuevo para hacer UPDATE.
 * Si no, devuelve null (skip silencioso).
 *
 * Nunca sobrescribe un nombre ya puesto por el barbero — eso sería
 * destruir input humano con datos de un CSV viejo.
 */
export function resolveDuplicateUpdate(
  existing: ExistingCustomer,
  csvName: string | null,
): string | null {
  const currentName = (existing.name ?? '').trim()
  if (currentName.length > 0) return null
  if (!csvName || csvName.trim().length === 0) return null
  return csvName.trim()
}
