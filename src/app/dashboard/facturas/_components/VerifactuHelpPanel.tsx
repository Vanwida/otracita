import {
  Shield,
  Check,
  FileText,
  Scissors,
  Info,
  ChevronDown,
} from 'lucide-react'
import VerifactuBadge from './VerifactuBadge'

// -----------------------------------------------------------------------------
// VerifactuHelpPanel — panel educativo destacado en /dashboard/facturas.
//
// Objetivo: dar tranquilidad al barbero (sin conocimiento fiscal) sobre que
// su facturación cumple con la normativa, explicar QUIÉN hace QUÉ, y
// responder las dudas frecuentes sin jerga.
//
// Implementación: 100% server component. Colapsables con <details>/<summary>
// nativos — zero JS. Esto carga instantáneo y funciona incluso sin
// hidratación.
// -----------------------------------------------------------------------------

export default function VerifactuHelpPanel() {
  return (
    <section className="mt-6 bg-surface border border-line rounded-2xl overflow-hidden">
      {/* ─── Hero ────────────────────────────────────────────────────── */}
      <div
        className="relative px-5 md:px-7 py-5 md:py-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(201,101,60,0.06) 0%, rgba(94,139,107,0.06) 100%)',
        }}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-softer border border-brand/20 flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg md:text-xl font-bold text-ink">
              Tu facturación cumple con Hacienda
            </h2>
            <p className="text-sm text-ink-2 mt-1 max-w-2xl leading-relaxed">
              otracita es un sistema de facturación compatible con <strong>VeriFactu</strong>{' '}
              (RD 1007/2023) — la normativa anti-fraude que todos los autónomos tendrán
              que adoptar antes del <strong>1 de julio de 2027</strong>. Tú ya lo cumples
              desde hoy.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Tabla Tú / Nosotros ─────────────────────────────────────── */}
      <div className="px-5 md:px-7 py-5 md:py-6 border-t border-line">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-full bg-overlay border border-line flex items-center justify-center">
                <Scissors className="h-3.5 w-3.5 text-ink-2" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-ink-3">
                Tú te encargas de
              </h3>
            </div>
            <ul className="space-y-2">
              <ChecklistItem>Rellenar tus datos fiscales (NIF, nombre, dirección) en Mi&nbsp;negocio</ChecklistItem>
              <ChecklistItem>Confirmar reservas cuando se presenten los clientes</ChecklistItem>
              <ChecklistItem>Emitir tickets manuales para walk-ins que lleguen sin cita</ChecklistItem>
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-7 w-7 rounded-full bg-brand-softer border border-brand/20 flex items-center justify-center">
                <Shield className="h-3.5 w-3.5 text-brand" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-brand">
                Nosotros nos encargamos de
              </h3>
            </div>
            <ul className="space-y-2">
              <ChecklistItem brand>Emitir el ticket automáticamente cada cita confirmada</ChecklistItem>
              <ChecklistItem brand>Numeración correlativa sin huecos (obligatorio legal)</ChecklistItem>
              <ChecklistItem brand>Cálculo automático del IVA según tu tipo</ChecklistItem>
              <ChecklistItem brand>Firma criptográfica (huella SHA-256) anti-manipulación</ChecklistItem>
              <ChecklistItem brand>Encadenamiento con la factura anterior (anti-fraude)</ChecklistItem>
              <ChecklistItem brand>Registro automático en Hacienda vía VeriFactu</ChecklistItem>
              <ChecklistItem brand>Código QR en cada factura para verificación del cliente</ChecklistItem>
              <ChecklistItem brand>Libro de facturas en PDF, Excel y CSV para tu gestor</ChecklistItem>
              <ChecklistItem brand>Rectificativas en 3 clics si te equivocas</ChecklistItem>
            </ul>
          </div>
        </div>
      </div>

      {/* ─── Colapsables con dudas frecuentes ───────────────────────── */}
      <div className="border-t border-line bg-overlay/30 divide-y divide-line">
        <FaqItem question="¿Qué significa cada estado en la columna «Hacienda»?">
          <div className="space-y-3">
            <StateRow status="accepted">
              La factura ha sido enviada y aceptada por Hacienda. Tu cliente puede
              verificarla escaneando el QR.
            </StateRow>
            <StateRow status="pending">
              Aún no enviada a Hacienda. Normal en los primeros segundos tras emitir —
              el envío se procesa automáticamente.
            </StateRow>
            <StateRow status="accepted_with_errors">
              Hacienda la registró pero tiene avisos menores (ej. algún campo
              opcional con formato raro). Revísala, no suele ser grave.
            </StateRow>
            <StateRow status="rejected">
              Algún dato no pasa la validación de Hacienda (típicamente un NIF del
              cliente mal formado). Corrige y reintentamos solos.
            </StateRow>
            <StateRow status="error">
              Fallo técnico (red, mantenimiento Hacienda). Reintentamos solos con
              espera progresiva — no tienes que hacer nada.
            </StateRow>
            <StateRow status={null}>
              Factura emitida antes de activar VeriFactu. Sigue siendo legal bajo la
              normativa anterior (RD 1619/2012).
            </StateRow>
          </div>
        </FaqItem>

        <FaqItem question="¿Qué hago con mis modelos 303, 130 o IRPF?">
          <div className="space-y-3 text-sm text-ink-2 leading-relaxed">
            <p>
              <strong className="text-ink">Hoy</strong>: el dashboard muestra los
              totales mensuales y exporta CSV/Excel/PDF que pasas a tu gestor. Los
              datos están 100% limpios y trazables.
            </p>
            <p>
              <strong className="text-ink">Próximamente</strong>: generaremos
              automáticamente los modelos <strong>303 (IVA trimestral)</strong> y{' '}
              <strong>130 (IRPF trimestral)</strong> listos para subir a AEAT —
              reemplazando Holded/Quipu completamente.
            </p>
            <p className="text-xs text-ink-3">
              Ahorro estimado: 20-30€/mes de la suscripción separada.
            </p>
          </div>
        </FaqItem>

        <FaqItem question="¿Qué hago si emito una factura por error?">
          <div className="space-y-3 text-sm text-ink-2 leading-relaxed">
            <p>
              <strong className="text-ink">Nunca la borres</strong> — sería ilegal
              (RD 1619/2012 exige numeración correlativa sin huecos). En su lugar,
              emite una <strong>rectificativa</strong>.
            </p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Abre la factura con error</li>
              <li>
                Pulsa <span className="text-brand font-medium">«Emitir rectificativa»</span>
              </li>
              <li>Elige uno de los 5 motivos (datos mal, importes mal, devolución, IVA, otro)</li>
              <li>Introduce los importes correctos</li>
            </ol>
            <p>
              La original queda marcada como «rectificada», la nueva es la válida.
              Tanto Hacienda como tu gestor ven la cadena completa — auditoría
              transparente.
            </p>
          </div>
        </FaqItem>

        <FaqItem question="¿Qué pasa cuando VeriFactu sea obligatorio en julio 2027?">
          <div className="space-y-3 text-sm text-ink-2 leading-relaxed">
            <p>
              <strong className="text-ink">Nada cambia para ti</strong>. Ya estás
              cumpliendo desde el día 1 — sigues operando exactamente igual.
            </p>
            <p>
              Otros barberos que usen software sin adaptar tendrán que migrar
              corriendo antes de la fecha límite. Si están en Booksy o Holded sin
              soporte VeriFactu, arriesgan sanciones de hasta 50.000€/ejercicio.
            </p>
            <p className="text-xs text-ink-3">
              Nosotros firmamos nuestra Declaración Responsable como fabricantes
              ante AEAT conforme al RD 1007/2023 art. 13.
            </p>
          </div>
        </FaqItem>

        <FaqItem question="¿Mi cliente puede verificar que su factura es legal?">
          <div className="space-y-3 text-sm text-ink-2 leading-relaxed">
            <p>
              Sí. Cada factura que emites lleva un código QR en la esquina
              superior. Tu cliente lo escanea con el móvil y se abre la sede
              electrónica de la AEAT mostrando <em>«Factura verificada»</em> con los
              datos principales.
            </p>
            <p>
              Es señal de profesionalidad — no muchos barberos lo ofrecen todavía.
            </p>
          </div>
        </FaqItem>

        <FaqItem question="¿Cuánto cuesta todo esto?">
          <div className="space-y-3 text-sm text-ink-2 leading-relaxed">
            <p>
              <strong className="text-ink">Cero extra. Incluido en tu plan otracita.</strong>
            </p>
            <p>
              Para comparar: Holded cobra desde 29€/mes por funcionalidad similar (y
              aún están adaptándose a VeriFactu), Quipu desde 17€/mes sin bot
              WhatsApp ni app para tus clientes.
            </p>
          </div>
        </FaqItem>
      </div>

      {/* ─── Legal fine print ──────────────────────────────────────── */}
      <div className="px-5 md:px-7 py-3 border-t border-line text-[11px] text-ink-3 flex items-center gap-2">
        <FileText className="h-3 w-3 shrink-0" />
        <span>
          otracita actúa como Sistema Informático de Facturación (SIF) conforme al{' '}
          <a
            href="/legal/verifactu"
            className="underline hover:text-ink-2"
          >
            Real Decreto 1007/2023 y la Orden HAC/1177/2024
          </a>
          . Tu facturación es legal, trazable y auditable.
        </span>
      </div>
    </section>
  )
}

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

function ChecklistItem({ children, brand }: { children: React.ReactNode; brand?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm text-ink-2 leading-relaxed">
      <Check
        className={`h-4 w-4 shrink-0 mt-0.5 ${brand ? 'text-brand' : 'text-success'}`}
        strokeWidth={3}
      />
      <span>{children}</span>
    </li>
  )
}

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group px-5 md:px-7 py-3">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-ink hover:text-brand transition-colors list-none">
        <Info className="h-3.5 w-3.5 text-ink-3 group-hover:text-brand transition-colors" />
        <span className="flex-1">{question}</span>
        <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pt-3 pb-1 pl-6">{children}</div>
    </details>
  )
}

function StateRow({
  status,
  children,
}: {
  status: 'pending' | 'accepted' | 'accepted_with_errors' | 'rejected' | 'error' | null
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
      <div className="shrink-0 w-28">
        <VerifactuBadge status={status} />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
