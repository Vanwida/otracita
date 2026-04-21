import { MessageCircle, Mail, HelpCircle, ExternalLink, ChevronDown } from 'lucide-react'

// Centralised so the Ayuda page mirrors the chat widget contact details.
const SUPPORT_WHATSAPP = '+34 644 288 663'
const SUPPORT_WHATSAPP_LINK = 'https://wa.me/34644288663?text=Hola%21%20Necesito%20ayuda%20con%20otracita'
const SUPPORT_EMAIL = 'soporte@otracita.es'

interface Faq {
  q: string
  a: React.ReactNode
}

const FAQS: Faq[] = [
  {
    q: '¿Cómo cancelo mi suscripción?',
    a: (
      <>
        Desde <a className="text-brand hover:text-brand-strong underline underline-offset-2" href="/dashboard/mi-plan">Mi plan</a>, pulsa
        &ldquo;Gestionar suscripción&rdquo;. Se abrirá el portal de Stripe donde puedes cancelar en un clic. Seguirás teniendo acceso hasta el final del periodo ya pagado.
      </>
    ),
  },
  {
    q: '¿Cómo cambio mi URL de Booksy o mi Google Calendar?',
    a: (
      <>
        Entra en <a className="text-brand hover:text-brand-strong underline underline-offset-2" href="/dashboard/bot">El bot</a>, sección
        &ldquo;Integraciones&rdquo;. Edita la URL de Booksy o el Google Calendar ID y guarda. El bot usará los valores nuevos al instante.
      </>
    ),
  },
  {
    q: '¿Cómo sabe el bot mi disponibilidad?',
    a: (
      <>
        El bot mira tu Google Calendar en tiempo real: los huecos libres dentro de tu horario de apertura son los que ofrece al cliente. Puedes ajustar
        horario y días bloqueados desde <a className="text-brand hover:text-brand-strong underline underline-offset-2" href="/dashboard/negocio">Mi negocio</a>.
      </>
    ),
  },
  {
    q: '¿Dónde veo las reservas que hace el bot?',
    a: (
      <>
        Todas las reservas aparecen en <a className="text-brand hover:text-brand-strong underline underline-offset-2" href="/dashboard/agenda">Agenda</a> y en tu Google
        Calendar conectado. También tienes el resumen en <a className="text-brand hover:text-brand-strong underline underline-offset-2" href="/dashboard">Inicio</a>.
      </>
    ),
  },
]

export default function AyudaPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Ayuda</h1>
        <p className="text-ink-2">Contáctanos directamente o revisa las preguntas más habituales.</p>
      </div>

      {/* Contact cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <a
          href={SUPPORT_WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="group bg-surface border border-line rounded-2xl p-5 md:p-6 hover:border-brand transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center shrink-0">
              <MessageCircle className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-1">Más rápido</p>
              <h2 className="text-lg font-semibold text-ink mb-1 group-hover:text-brand transition-colors flex items-center gap-1.5">
                WhatsApp <ExternalLink className="h-3.5 w-3.5" />
              </h2>
              <p className="text-sm text-ink-2">
                Te contestamos en el mismo día.<br />
                <span className="font-mono text-ink">{SUPPORT_WHATSAPP}</span>
              </p>
            </div>
          </div>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="group bg-surface border border-line rounded-2xl p-5 md:p-6 hover:border-brand transition-colors"
        >
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-brand-softer border border-brand/20 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-brand" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-1">Por email</p>
              <h2 className="text-lg font-semibold text-ink mb-1 group-hover:text-brand transition-colors">Soporte</h2>
              <p className="text-sm text-ink-2">
                Para temas largos o archivos adjuntos.<br />
                <span className="font-mono text-ink">{SUPPORT_EMAIL}</span>
              </p>
            </div>
          </div>
        </a>
      </div>

      {/* FAQs */}
      <section className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 md:px-6 border-b border-line flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-ink-3" />
          <h2 className="text-base font-semibold text-ink">Preguntas frecuentes</h2>
        </div>
        <div className="divide-y divide-line">
          {FAQS.map((faq, i) => (
            <details key={i} className="group px-5 md:px-6 py-4">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <span className="text-sm font-medium text-ink">{faq.q}</span>
                <ChevronDown className="h-4 w-4 text-ink-3 shrink-0 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-3 text-sm text-ink-2 leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
