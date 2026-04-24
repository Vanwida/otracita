// -----------------------------------------------------------------------------
// VeriFactu — construcción de la URL del código QR.
//
// Fuente autoritativa: PDF AEAT "Detalle de las especificaciones técnicas del
// código «QR» de la factura y de la URL del servicio de cotejo o remisión de
// información por parte del receptor de la factura" v0.5.0, 10/12/2025.
//
// URL patterns (spec literal):
//   · Sistema VeriFactu (facturas verificables):
//     - Producción:  https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR
//     - Pruebas:     https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR
//   · Sistema SIF NO-VeriFactu (facturas no verificables):
//     - Producción:  https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu
//     - Pruebas:     https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu
//
// Parámetros (en este orden):
//   1. nif       — NIF del emisor (9 chars alfanuméricos)
//   2. numserie  — serie y número de factura (URL-encoded)
//   3. fecha     — DD-MM-YYYY
//   4. importe   — NNNN.DD (1 o 2 decimales; aquí siempre 2)
//
// URL-encoding UTF-8 obligatorio (spec sección 4): caracteres especiales
// del numserie como '/' '&' deben codificarse. Ej. "12345678&G33" → "12345678%26G33".
//
// IMPORTANTE: el contenido de texto ASCII del QR está limitado a códigos
// 32-126 (caracteres imprimibles) según la spec.
// -----------------------------------------------------------------------------

export type VerifactuEnv = 'production' | 'pruebas'

/** Base del endpoint según entorno y modo. */
const URL_BASES = {
  production: {
    verifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
    noVerifactu: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
  },
  pruebas: {
    verifactu: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
    noVerifactu: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
  },
} as const

export interface QrUrlInput {
  /** NIF del emisor (9 chars). */
  nif: string
  /** Serie y número de factura tal y como aparece en NumSerieFactura. */
  numserie: string
  /** Fecha de expedición DD-MM-YYYY. */
  fecha: string
  /** Importe total con 1-2 decimales, ej "241.4" o "241.40". */
  importe: string
  /** Entorno. Default 'pruebas' hasta que estemos validados en M4. */
  env?: VerifactuEnv
  /** true = factura verificable (VeriFactu), false = NO-VeriFactu. Default true. */
  verifactu?: boolean
}

/**
 * Construye la URL completa del QR. URL-encoding por parámetro con UTF-8.
 *
 * Usa URLSearchParams que aplica el encoding estándar `application/x-www-form-urlencoded`.
 * Importante: el orden de los parámetros es FIJO (nif, numserie, fecha, importe);
 * no usamos URLSearchParams iterando porque preservar ese orden no está garantizado
 * entre navegadores. Construimos manualmente.
 */
export function buildQrUrl(input: QrUrlInput): string {
  const env = input.env ?? 'pruebas'
  const mode = input.verifactu === false ? 'noVerifactu' : 'verifactu'
  const base = URL_BASES[env][mode]

  const params = [
    ['nif', input.nif],
    ['numserie', input.numserie],
    ['fecha', input.fecha],
    ['importe', input.importe],
  ]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&')

  return `${base}?${params}`
}

/**
 * Texto obligatorio que acompaña al QR según AEAT:
 *   - Siempre encima: "QR tributario:"
 *   - Solo en VeriFactu, debajo: "Factura verificable en la sede electrónica
 *     de la AEAT" (o la frase "VERI*FACTU").
 */
export const QR_TEXT_ABOVE = 'QR tributario:'
export const QR_TEXT_BELOW_VERIFACTU = 'Factura verificable en la sede electrónica de la AEAT'

/** Tamaño del QR en milímetros — AEAT exige entre 30×30 y 40×40. */
export const QR_SIZE_MM = 35

/** Nivel de corrección de errores — AEAT exige M (medio). */
export const QR_ERROR_CORRECTION: 'L' | 'M' | 'Q' | 'H' = 'M'
