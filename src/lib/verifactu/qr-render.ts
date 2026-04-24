import QRCode from 'qrcode'
import { QR_ERROR_CORRECTION } from './qr.ts'

// -----------------------------------------------------------------------------
// VeriFactu — renderizado del QR como SVG string o dataURL PNG.
//
// Preferencia por SVG para impresión: escala perfectamente a cualquier tamaño
// sin pérdida. PNG dataURL como fallback para contextos que no aceptan SVG
// (algunas libs de PDF, o inyección en plantillas antiguas).
//
// Parámetros fijos por AEAT:
//   · Nivel corrección: M (medio) — Orden HAC/1177/2024 art. 21
//   · ISO/IEC 18004:2015 — implícito en la librería `qrcode` npm
//   · UTF-8 — librería lo aplica por defecto sobre el string entrada
// -----------------------------------------------------------------------------

/**
 * Genera un QR como SVG string, listo para embeber inline en HTML/PDF.
 * El viewBox hace que escale limpio — el tamaño real se define con CSS/estilo.
 */
export async function renderQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: 1, // quiet zone en módulos (1 es el mínimo ISO; los márgenes mm los damos con CSS)
  })
}

/**
 * Genera el QR como dataURL PNG (image/png;base64,...). Útil cuando el
 * consumidor necesita un <img src="..." />.
 */
export async function renderQrPngDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: 1,
    width: 400, // resolución generosa para print nítido
  })
}
