import { MessageCircle, Mail, HelpCircle, ExternalLink, ChevronDown } from 'lucide-react'
import { HELP_SECTIONS } from '@/lib/help-faqs'

// Centralised so the Ayuda page mirrors the chat widget contact details.
const SUPPORT_WHATSAPP = '+34 644 288 663'
const SUPPORT_WHATSAPP_LINK = 'https://wa.me/34644288663?text=Hola%21%20Necesito%20ayuda%20con%20otracita'
const SUPPORT_EMAIL = 'soporte@otracita.es'

// -----------------------------------------------------------------------------
// Parse `[label](/path)` markdown-style links in answer text into real <a>
// elements. The FAQ source is plain text (used also by the chat widget LLM),
// but here we want clickable links to dashboard sections.
// -----------------------------------------------------------------------------
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g

function renderAnswer(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  LINK_RE.lastIndex = 0
  while ((match = LINK_RE.exec(text)) !== null) {
    const [whole, label, href] = match
    if (match.index > last) nodes.push(text.slice(last, match.index))
    nodes.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        className="text-brand hover:text-brand-strong underline underline-offset-2"
      >
        {label}
      </a>,
    )
    last = match.index + whole.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export default function AyudaPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Ayuda</h1>
        <p className="text-ink-2">
          Tu primer puerto: el chat-widget (abajo a la derecha) responde cualquier duda usando la misma base que ves aquí.
          Si no encuentras respuesta, escríbenos por WhatsApp.
        </p>
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
                Te contestamos en el mismo día.
                <br />
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
                Para temas largos o archivos adjuntos.
                <br />
                <span className="font-mono text-ink">{SUPPORT_EMAIL}</span>
              </p>
            </div>
          </div>
        </a>
      </div>

      {/* FAQs by section */}
      <div className="space-y-6">
        {HELP_SECTIONS.map((section) => (
          <section key={section.title} className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="px-5 py-4 md:px-6 border-b border-line flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-ink-3" />
              <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            </div>
            <div className="divide-y divide-line">
              {section.items.map((faq, i) => (
                <details key={i} className="group px-5 md:px-6 py-4">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                    <span className="text-sm font-medium text-ink">{faq.q}</span>
                    <ChevronDown className="h-4 w-4 text-ink-3 shrink-0 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-3 text-sm text-ink-2 leading-relaxed">{renderAnswer(faq.a)}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
