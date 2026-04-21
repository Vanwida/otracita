import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand'

export const metadata: Metadata = {
  title: 'Política de Privacidad — otracita',
  description: 'Política de privacidad y tratamiento de datos personales de otracita.',
}

// Last reviewed: 2026-04-21. Update the revision date when substantive changes
// are made and inform active users per their subscription contact.
const LAST_UPDATED = '21 de abril de 2026'

export default function PrivacidadPage() {
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
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2">Política de Privacidad</h1>
        <p className="text-ink-3 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="prose prose-ink max-w-none space-y-6 text-ink-2 leading-relaxed">

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">1. Responsable del tratamiento</h2>
            <p>
              El responsable del tratamiento de los datos personales recogidos en otracita.es (en adelante, &quot;<strong>otracita</strong>&quot; o &quot;<strong>el Servicio</strong>&quot;) es <strong>AI Studios (Vanwida)</strong>, con sede en Barcelona, España. Para cualquier consulta relacionada con la privacidad puedes escribirnos a <a className="text-brand hover:text-brand-strong" href="mailto:privacidad@otracita.es">privacidad@otracita.es</a>.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">2. Datos que recogemos</h2>
            <p>Recabamos únicamente los datos estrictamente necesarios para prestar el servicio:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Del titular de la suscripción</strong> (barbería/negocio): nombre comercial, dirección de correo electrónico, teléfono, datos fiscales (nombre fiscal, NIF/CIF, dirección fiscal), datos de facturación y pago gestionados a través de Stripe.</li>
              <li><strong>De los clientes finales del barbero</strong>, a través del bot de WhatsApp: nombre, número de teléfono, y — cuando el titular active la facturación y el cliente los aporte — NIF y dirección postal. Estos datos son propiedad del negocio titular de la cuenta, no de otracita.</li>
              <li><strong>Técnicos</strong>: dirección IP, user-agent, logs de uso del panel.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">3. Finalidad del tratamiento</h2>
            <p>Tratamos los datos para:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Prestar el servicio contratado (bot de reservas, panel de gestión, sincronización con Booksy, emisión de tickets y facturas).</li>
              <li>Cumplir con obligaciones legales, en particular fiscales y contables (RD 1619/2012, Ley 58/2003 General Tributaria).</li>
              <li>Facturar y cobrar la suscripción al titular a través de Stripe.</li>
              <li>Comunicar incidencias operativas al titular por WhatsApp o correo electrónico.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">4. Base legal</h2>
            <p>
              La base legal para el tratamiento es la <strong>ejecución del contrato de servicio</strong> con el titular de la suscripción (art. 6.1.b RGPD) y el <strong>cumplimiento de obligaciones legales</strong> (art. 6.1.c RGPD) en materia fiscal y contable.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">5. Encargados y cesionarios</h2>
            <p>Los datos pueden ser tratados por los siguientes encargados, con quienes se han firmado los acuerdos exigidos por el RGPD:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Vercel Inc.</strong> (hosting, EE.UU. con cláusulas tipo).</li>
              <li><strong>Neon Inc.</strong> (base de datos).</li>
              <li><strong>Stripe Payments Europe</strong> (procesador de pagos).</li>
              <li><strong>Meta Platforms Ireland</strong> (API de WhatsApp Business).</li>
              <li><strong>Google LLC</strong> (Google Calendar, cuando el titular conecta su calendario).</li>
              <li><strong>OpenAI / xAI</strong> (modelos de lenguaje para comprensión de mensajes; no se entrenan con los datos).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">6. Plazo de conservación</h2>
            <p>
              Conservamos los datos mientras el titular mantenga la suscripción activa y durante los plazos exigidos por la ley (mínimo 4 años para documentación fiscal según art. 66 LGT, 6 años para documentación mercantil). Pasado ese plazo, los datos se anonimizan o eliminan.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">7. Derechos del interesado</h2>
            <p>
              Puedes ejercer los derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad escribiéndonos a <a className="text-brand hover:text-brand-strong" href="mailto:privacidad@otracita.es">privacidad@otracita.es</a>. Si consideras que el tratamiento no cumple el RGPD, puedes reclamar ante la Agencia Española de Protección de Datos (<a className="text-brand hover:text-brand-strong" target="_blank" rel="noopener noreferrer" href="https://www.aepd.es">aepd.es</a>).
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">8. Cookies</h2>
            <p>
              otracita.es usa únicamente cookies técnicas estrictamente necesarias para el funcionamiento del servicio (sesión, preferencias). No usamos cookies de analítica ni publicidad de terceros.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">9. Cambios</h2>
            <p>
              Podemos actualizar esta política para reflejar cambios normativos o del servicio. Se notificará a los titulares activos con 15 días de antelación si los cambios son sustanciales.
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
