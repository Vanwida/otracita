import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand'

export const metadata: Metadata = {
  title: 'Términos y Condiciones — otracita',
  description: 'Términos y condiciones del servicio otracita.',
}

const LAST_UPDATED = '21 de abril de 2026'

export default function TerminosPage() {
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
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2">Términos y Condiciones</h1>
        <p className="text-ink-3 text-sm mb-10">Última actualización: {LAST_UPDATED}</p>

        <div className="max-w-none space-y-6 text-ink-2 leading-relaxed">

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">1. Objeto</h2>
            <p>
              Las presentes condiciones regulan el uso del servicio <strong>otracita</strong> (<a className="text-brand hover:text-brand-strong" href="https://otracita.es">otracita.es</a>), una plataforma SaaS operada por <strong>AI Studios (Vanwida)</strong>, con sede en Barcelona, España, que ofrece a negocios de hostelería y belleza (en adelante, <strong>&quot;el Cliente&quot;</strong>) un bot de WhatsApp para gestión de reservas, un panel de administración y herramientas de facturación.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">2. Contratación y precio</h2>
            <p>
              La contratación se realiza a través de <a className="text-brand hover:text-brand-strong" href="https://otracita.es/#precios">otracita.es</a> mediante pago recurrente mensual gestionado por Stripe. El precio vigente se publica en la web y puede ser modificado con 30 días de preaviso a los Clientes activos. Cualquier modificación no afecta a los meses ya pagados.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">3. Activación del servicio</h2>
            <p>
              Una vez recibido el pago, nuestro equipo activa manualmente el bot de WhatsApp del Cliente en un plazo máximo de <strong>48 horas laborales</strong>. Durante este plazo el Cliente puede completar la configuración de su negocio en el panel (datos, servicios, horarios). La activación incluye el alta del número en Meta Business y la configuración del webhook.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">4. Facturación propia del Cliente</h2>
            <p>
              Cuando el Cliente activa la funcionalidad de &quot;Facturación&quot;, otracita actúa como <strong>herramienta de emisión</strong> de tickets y facturas simplificadas/completas conforme al Real Decreto 1619/2012. La responsabilidad fiscal de dichos documentos recae íntegramente en el Cliente emisor. otracita no presta servicios de asesoría fiscal ni contable.
            </p>
            <p className="mt-3">
              El Cliente es responsable de:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Introducir correctamente sus datos fiscales (nombre, NIF/CIF, domicilio fiscal).</li>
              <li>Mantener la correlatividad y conservación de las facturas emitidas (mínimo 4 años).</li>
              <li>Declarar ante Hacienda los importes facturados (Modelo 303, 130, 390, etc.).</li>
              <li>Emitir facturas rectificativas cuando proceda (p. ej. si una reserva ya facturada se cancela).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">5. Obligaciones del Cliente</h2>
            <p>El Cliente se compromete a:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Usar el servicio conforme a la ley y a las presentes condiciones.</li>
              <li>No utilizar el bot para enviar mensajes no solicitados (spam), comerciales a terceros, o contenidos ilícitos.</li>
              <li>Informar a sus clientes finales de que las reservas son gestionadas por un sistema automatizado.</li>
              <li>Cumplir la normativa de protección de datos respecto a sus propios clientes (el Cliente es el responsable del tratamiento de los datos que introduce en el bot; otracita actúa como encargado del tratamiento).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">6. Disponibilidad del servicio</h2>
            <p>
              otracita se esfuerza en mantener el servicio disponible 24/7. Sin embargo, la disponibilidad depende parcialmente de terceros (Meta WhatsApp Cloud API, Stripe, Vercel, Neon, Booksy). No garantizamos una disponibilidad del 100% ni asumimos responsabilidad por interrupciones imputables a dichos terceros. Ante incidencias prolongadas, informamos al Cliente por el canal habitual (WhatsApp / email).
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">7. Baja y cancelación</h2>
            <p>
              El Cliente puede cancelar su suscripción en cualquier momento desde el panel (<a className="text-brand hover:text-brand-strong" href="https://otracita.es/dashboard/mi-plan">Mi plan → Gestionar suscripción</a>). La cancelación surte efecto al final del periodo de facturación en curso. No se realizan reembolsos parciales de meses ya pagados salvo por incumplimiento grave imputable a otracita. Tras la cancelación, el Cliente conserva acceso de solo-lectura a sus datos durante 30 días para poder exportarlos; pasado ese plazo los datos se archivan conforme a la política de conservación descrita en la Política de Privacidad.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">8. Limitación de responsabilidad</h2>
            <p>
              La responsabilidad total de otracita frente al Cliente por cualquier concepto queda limitada al importe pagado por el Cliente en los 12 meses anteriores al hecho que origine la reclamación. En ningún caso responderemos por daños indirectos, lucro cesante, pérdida de oportunidades o pérdida de clientes del Cliente.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">9. Modificación de las condiciones</h2>
            <p>
              otracita puede modificar estas condiciones. Se notificará a los Clientes activos con <strong>30 días de antelación</strong>. Si el Cliente no está de acuerdo, puede cancelar la suscripción sin coste antes de que los nuevos términos entren en vigor.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink mt-8 mb-3">10. Legislación y jurisdicción</h2>
            <p>
              Estas condiciones se rigen por la legislación española. Cualquier controversia se someterá a los Juzgados y Tribunales de Barcelona, renunciando las partes a cualquier otro fuero que pudiera corresponderles. Los consumidores mantienen sus derechos legales respecto al fuero de su domicilio.
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
