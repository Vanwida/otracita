import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand'

export const metadata: Metadata = {
  title: 'Aviso legal — otracita',
  description: 'Información legal y de identificación de otracita conforme a la LSSI-CE.',
}

const LAST_UPDATED = '21 de abril de 2026'

export default function AvisoLegalPage() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <nav className="border-b border-line">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <Link href="/" className="inline-flex items-center text-ink">
            <Wordmark height={28} />
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2">Aviso legal</h1>
        <p className="text-ink-3 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="max-w-none space-y-6 text-ink-2 leading-relaxed">

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Identificación</h2>
            <p>
              En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-3">
              <li><strong>Titular:</strong> AI Studios (Vanwida)</li>
              <li><strong>Dirección:</strong> Barcelona, España</li>
              <li><strong>Contacto:</strong> <a className="text-brand hover:text-brand-strong" href="mailto:hola@otracita.es">hola@otracita.es</a></li>
              <li><strong>Dominio:</strong> <a className="text-brand hover:text-brand-strong" href="https://otracita.es">otracita.es</a></li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Objeto</h2>
            <p>
              El presente aviso legal regula el uso del sitio web <a className="text-brand hover:text-brand-strong" href="https://otracita.es">otracita.es</a> y del servicio otracita, una plataforma SaaS de bot de WhatsApp, gestión de reservas y facturación para negocios de hostelería y belleza.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Condiciones de uso</h2>
            <p>
              El uso del servicio se rige por los <Link className="text-brand hover:text-brand-strong" href="/terminos">Términos y Condiciones</Link> y por la <Link className="text-brand hover:text-brand-strong" href="/privacidad">Política de Privacidad</Link>. El acceso al sitio web es gratuito; la contratación del servicio requiere suscripción mensual de pago.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Propiedad intelectual e industrial</h2>
            <p>
              Todos los contenidos de otracita.es (textos, diseños, logotipos, código) son titularidad de AI Studios / Vanwida o cuentan con la correspondiente licencia. Queda prohibida su reproducción, distribución, comunicación pública o transformación sin autorización expresa.
            </p>
            <p className="mt-3">
              La marca <strong>otracita</strong> y el logotipo asociado son propiedad de AI Studios / Vanwida.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Responsabilidad</h2>
            <p>
              El titular no se responsabiliza de los daños derivados del uso indebido del servicio ni de interrupciones imputables a terceros (Meta, Stripe, Vercel, Neon, Booksy). Los usuarios son responsables del uso que hagan del servicio y del cumplimiento de la legislación aplicable.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Legislación aplicable</h2>
            <p>
              El presente aviso legal se rige por la legislación española. Para cualquier controversia serán competentes los Juzgados y Tribunales de Barcelona.
            </p>
          </section>

        </div>

        <div className="mt-16 pt-8 border-t border-line">
          <Link href="/" className="text-brand hover:text-brand-strong font-medium text-sm">
            ← Volver a otracita
          </Link>
        </div>
      </article>
    </main>
  )
}
