import { MessageSquare, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default function MensajesPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Mensajes</h1>
        <p className="text-ink-2">Las conversaciones que el bot mantiene con tus clientes.</p>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-8 md:p-12 flex flex-col items-center text-center">
        <div className="h-16 w-16 rounded-2xl bg-brand-softer border border-brand/20 flex items-center justify-center mb-5 relative">
          <MessageSquare className="h-7 w-7 text-brand" />
          <Sparkles className="h-4 w-4 text-gold absolute -top-1 -right-1" />
        </div>

        <h2 className="font-display text-2xl md:text-3xl font-semibold text-ink mb-3">Próximamente</h2>
        <p className="text-ink-2 max-w-md leading-relaxed mb-6">
          Aquí podrás ver las conversaciones del bot con tus clientes en tiempo real. Por ahora el bot las gestiona
          automáticamente y los resultados aparecen como reservas en tu{' '}
          <Link href="/dashboard/agenda" className="text-brand hover:text-brand-strong underline underline-offset-2">
            agenda
          </Link>
          .
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard/agenda"
            className="inline-flex items-center justify-center rounded-xl bg-brand hover:bg-brand-strong px-5 py-3 text-sm font-semibold text-brand-ink transition-colors"
          >
            Ver mi agenda
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl border border-line bg-surface hover:bg-canvas px-5 py-3 text-sm font-semibold text-ink-2 hover:text-ink transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
