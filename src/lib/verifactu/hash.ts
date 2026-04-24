import { createHash } from 'node:crypto'

// -----------------------------------------------------------------------------
// VeriFactu — cálculo de huella/hash de registros de facturación.
//
// Fuente autoritativa: PDF AEAT "Detalle de las especificaciones técnicas
// para generación de la huella o hash de los registros de facturación"
// v0.1.2, 27/08/2024 (Departamento de Informática Tributaria).
//
// Especificación literal:
//   · Algoritmo: SHA-256 (único permitido actualmente — Lista L12 Orden
//     HAC/1177/2024 art. 6).
//   · Input: concatenación UTF-8 en formato
//     "nombreCampo1=valorCampo1&nombreCampo2=valorCampo2&...&nombreCampoN=valorCampoN"
//     en el orden EXACTO que define el PDF (ver abajo).
//   · Valores: trim de espacios inicio/fin. Numéricos: `123.1` y `123.10`
//     son equivalentes (ambos válidos). Empty: solo "nombre=" sin valor.
//   · Output: hexadecimal MAYÚSCULAS, 64 caracteres alfanuméricos.
//
// IMPORTANTE: los tests en hash.test.ts validan byte-a-byte contra los 3
// vectores oficiales del PDF AEAT. Si algo aquí cambia y los tests
// siguen pasando, seguimos bien. Si los tests empiezan a fallar, NO
// desplegar — algo del algoritmo está mal.
// -----------------------------------------------------------------------------

/** Tipo de factura según L1 AEAT. F1=ordinaria, F2=simplificada, F3=factura
 *  sustituida por asentada, R1..R5=rectificativas (motivos R1-R5). */
export type TipoFactura = 'F1' | 'F2' | 'F3' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

/**
 * Normaliza un valor para el hash según spec AEAT:
 *   - null/undefined → string vacío ""
 *   - trim espacios inicio/fin
 *   - no convertir números (123.1 y 123.10 ambos válidos; respetamos la
 *     representación que venga del campo XML)
 */
function normaliseValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? String(v) : v
  return s.trim()
}

/** Concatena pares nombre=valor con separador &. Formato exacto requerido
 *  por AEAT. Empty values → "nombre=". */
function buildPayload(pairs: Array<[string, string | number | null | undefined]>): string {
  return pairs.map(([name, value]) => `${name}=${normaliseValue(value)}`).join('&')
}

/** SHA-256 sobre UTF-8 → HEX MAYÚSCULAS. */
function sha256HexUpper(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex').toUpperCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// RegistroAlta — hash de una factura nueva (o rectificativa).
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistroAltaInput {
  /** NIF del emisor (obligado tributario). */
  IDEmisorFactura: string
  /** Serie/número de factura, ej. "2026-034" o "F/G33/123". */
  NumSerieFactura: string
  /** Fecha de expedición en formato DD-MM-YYYY. */
  FechaExpedicionFactura: string
  /** Tipo de factura L1 AEAT. */
  TipoFactura: TipoFactura
  /** Cuota total (IVA). String numérico, ej "12.35" o "12.3". */
  CuotaTotal: string | number
  /** Importe total. String numérico, ej "123.45" o "123.4". */
  ImporteTotal: string | number
  /** Huella del registro ANTERIOR del mismo SIF. Vacío si es el primer registro. */
  Huella: string
  /** Fecha/hora/huso de generación del registro en ISO 8601 con timezone,
   *  ej "2024-01-01T19:20:30+01:00". */
  FechaHoraHusoGenRegistro: string
}

/**
 * Calcula la huella SHA-256 de un RegistroAlta.
 *
 * Orden de los campos (fijo por AEAT):
 *   1. IDEmisorFactura
 *   2. NumSerieFactura
 *   3. FechaExpedicionFactura
 *   4. TipoFactura
 *   5. CuotaTotal
 *   6. ImporteTotal
 *   7. Huella (del anterior; vacío si primer registro)
 *   8. FechaHoraHusoGenRegistro
 */
export function computeHashAlta(input: RegistroAltaInput): string {
  const payload = buildPayload([
    ['IDEmisorFactura', input.IDEmisorFactura],
    ['NumSerieFactura', input.NumSerieFactura],
    ['FechaExpedicionFactura', input.FechaExpedicionFactura],
    ['TipoFactura', input.TipoFactura],
    ['CuotaTotal', input.CuotaTotal],
    ['ImporteTotal', input.ImporteTotal],
    ['Huella', input.Huella],
    ['FechaHoraHusoGenRegistro', input.FechaHoraHusoGenRegistro],
  ])
  return sha256HexUpper(payload)
}

// ─────────────────────────────────────────────────────────────────────────────
// RegistroAnulacion — hash de una factura que se anula.
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistroAnulacionInput {
  /** NIF del emisor de la factura anulada. */
  IDEmisorFacturaAnulada: string
  /** Serie/número de la factura anulada. */
  NumSerieFacturaAnulada: string
  /** Fecha de expedición de la factura anulada (DD-MM-YYYY). */
  FechaExpedicionFacturaAnulada: string
  /** Huella del registro anterior del SIF. */
  Huella: string
  /** ISO 8601 con timezone. */
  FechaHoraHusoGenRegistro: string
}

/**
 * Calcula la huella SHA-256 de un RegistroAnulacion.
 *
 * Orden de los campos (fijo por AEAT):
 *   1. IDEmisorFacturaAnulada
 *   2. NumSerieFacturaAnulada
 *   3. FechaExpedicionFacturaAnulada
 *   4. Huella (del anterior)
 *   5. FechaHoraHusoGenRegistro
 */
export function computeHashAnulacion(input: RegistroAnulacionInput): string {
  const payload = buildPayload([
    ['IDEmisorFacturaAnulada', input.IDEmisorFacturaAnulada],
    ['NumSerieFacturaAnulada', input.NumSerieFacturaAnulada],
    ['FechaExpedicionFacturaAnulada', input.FechaExpedicionFacturaAnulada],
    ['Huella', input.Huella],
    ['FechaHoraHusoGenRegistro', input.FechaHoraHusoGenRegistro],
  ])
  return sha256HexUpper(payload)
}

// Export para tests/debug — permite inspeccionar el payload exacto que se
// hashea sin tener que recalcular.
export const _internals = { buildPayload, sha256HexUpper, normaliseValue }
