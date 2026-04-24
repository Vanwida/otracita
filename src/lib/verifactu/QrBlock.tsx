import { QR_TEXT_ABOVE, QR_TEXT_BELOW_VERIFACTU, QR_SIZE_MM } from './qr.ts'
import { renderQrSvg } from './qr-render.ts'

// -----------------------------------------------------------------------------
// QrBlock — componente server que renderiza el bloque QR reglamentario.
//
// Composición obligatoria (AEAT Orden HAC/1177/2024 art. 20 y 21 + PDF v0.5.0
// sección 3 "Detalles de la ubicación y presentación"):
//
//   ┌──────────────────────┐
//   │   QR tributario:     │  ← texto obligatorio encima
//   │                      │
//   │   ▓▓▓ QR 35×35 ▓▓▓   │  ← QR 30-40mm, nivel corrección M
//   │                      │
//   │   Factura verificable│
//   │   en la sede         │  ← texto obligatorio debajo (solo VeriFactu)
//   │   electrónica AEAT   │
//   └──────────────────────┘
//
// Márgenes blancos mínimos: 2mm (recomendado 6mm). En print, asumimos el
// contenedor padre da padding suficiente.
// -----------------------------------------------------------------------------

interface Props {
  /** URL completa al servicio de cotejo AEAT (usar `buildQrUrl()` para construirla). */
  qrUrl: string
  /** true = sistema VeriFactu (verificable). false = SIF NO-VeriFactu. Controla
   *  el texto bajo el QR. */
  verifactu?: boolean
  /** Tamaño en mm — respetar rango 30-40. Default 35. */
  sizeMm?: number
}

export default async function QrBlock({ qrUrl, verifactu = true, sizeMm = QR_SIZE_MM }: Props) {
  const svg = await renderQrSvg(qrUrl)
  // Pasamos el SVG directamente inline. Sustituimos width/height por
  // viewBox-relative (mm) para que el navegador escale a print.
  const cleaned = svg.replace(/width="[^"]*"/, '').replace(/height="[^"]*"/, '')

  return (
    <div
      className="flex flex-col items-center gap-1 text-center font-mono"
      style={{ width: `${sizeMm + 8}mm` }}
    >
      <span className="text-[8pt] font-semibold text-ink leading-tight">
        {QR_TEXT_ABOVE}
      </span>
      <div
        aria-label="Código QR de verificación de la factura"
        dangerouslySetInnerHTML={{ __html: cleaned }}
        style={{
          width: `${sizeMm}mm`,
          height: `${sizeMm}mm`,
          padding: '2mm',
          background: '#fff',
        }}
      />
      {verifactu && (
        <span className="text-[7pt] text-ink-2 leading-tight max-w-full">
          {QR_TEXT_BELOW_VERIFACTU}
        </span>
      )}
    </div>
  )
}
