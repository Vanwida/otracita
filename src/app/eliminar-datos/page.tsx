import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand'

export const metadata: Metadata = {
  title: 'Eliminar tus datos | otracita',
  description: 'Como pedir a otracita que borre tus datos personales.',
}

const LAST_UPDATED = '17 de agosto de 2026'

export default function EliminarDatosPage() {
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
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2">Eliminar tus datos</h1>
        <p className="text-ink-3 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="prose prose-ink max-w-none space-y-6 text-ink-2 leading-relaxed">
          <section>
            <p>
              Puedes pedir que borremos los datos personales que otracita trata como responsable. Escríbenos a{' '}
              <a className="text-brand hover:text-brand-strong" href="mailto:hola@otracita.es">hola@otracita.es</a>{' '}
              desde el correo de la cuenta, con el asunto &quot;Borrar mis datos&quot;.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Qué borramos</h2>
            <p>Cuenta, email, teléfono, datos de facturación de la suscripción y logs técnicos asociados.</p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Qué no borramos de inmediato</h2>
            <p>
              Datos de clientes finales del barbero (él es el responsable; se los devolvemos o borramos a su petición)
              y lo que la ley fiscal obliga a guardar (mínimo 4 años).
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Plazo</h2>
            <p>30 días, salvo bloqueo legal.</p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">Si eres cliente de una barbería</h2>
            <p>
              Escribe a esa barbería o a{' '}
              <a className="text-brand hover:text-brand-strong" href="mailto:hola@otracita.es">hola@otracita.es</a>{' '}
              y lo tramitamos con el titular.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-line">
          <Link href="/" className="text-brand hover:text-brand-strong font-medium text-sm">
            Volver a otracita
          </Link>
        </div>
      </article>
    </main>
  )
}
