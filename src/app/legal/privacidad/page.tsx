import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand'

// -----------------------------------------------------------------------------
// /legal/privacidad — Política de privacidad (borrador técnico).
//
// Este documento es un BORRADOR redactado por el equipo técnico para cubrir
// los mínimos exigibles por RGPD (Reglamento (UE) 2016/679) + LOPDGDD
// (LO 3/2018) en lo que se puede afirmar sin asesor legal:
//   · responsable, finalidades, base legal, datos tratados, sub-encargados,
//     derechos ARSULIPO, retención, contacto.
//
// Lo que NO está aquí (queda fuera del scope técnico, requiere abogado):
//   · DPA con cada sub-encargado firmado
//   · RAT (Registro de Actividades de Tratamiento) formal
//   · Designación de DPO si aplica
//   · Protocolo de brechas de seguridad
//
// La página se mantiene legible (anchos máximos), usa tokens del theme y
// se enlaza desde el form público de reserva (PWA /[slug]).
// -----------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Política de privacidad — otracita',
  description:
    'Política de privacidad de otracita: cómo tratamos los datos personales que entran por nuestra plataforma SaaS para barberías.',
}

const LAST_REVIEW = '22 de mayo de 2026'
const CONTACT_EMAIL = 'hola@otracita.es'

interface SubProcessor {
  name: string
  purpose: string
  country: string
}

// Sub-encargados de tratamiento — terceros que procesan datos personales
// por cuenta nuestra para que la plataforma funcione. Mantener esta lista
// sincronizada con la realidad técnica: si añades un proveedor, añádelo
// aquí.
const SUB_PROCESSORS: SubProcessor[] = [
  {
    name: 'Neon',
    purpose: 'Base de datos PostgreSQL serverless (almacenamiento principal).',
    country: 'UE (Frankfurt)',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting de la aplicación web y funciones serverless.',
    country: 'UE + EE. UU. (con cláusulas tipo)',
  },
  {
    name: 'Stripe',
    purpose: 'Procesamiento de pagos y suscripciones (Stripe Connect).',
    country: 'UE + EE. UU. (con cláusulas tipo)',
  },
  {
    name: 'Meta — WhatsApp Cloud API',
    purpose: 'Envío y recepción de mensajes de WhatsApp para reservas y recordatorios.',
    country: 'UE + EE. UU. (con cláusulas tipo)',
  },
  {
    name: 'ImprovMX',
    purpose: 'Reenvío de correos del dominio @otracita.es.',
    country: 'UE',
  },
  {
    name: 'Postmark',
    purpose: 'Envío de correos transaccionales (confirmaciones, recuperación).',
    country: 'EE. UU. (con cláusulas tipo)',
  },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <nav className="border-b border-line print:hidden">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <Link href="/" className="inline-flex items-center text-ink">
            <Wordmark height={28} />
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-6 py-12 md:py-16 print:py-6">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-line bg-overlay px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-ink-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          Borrador técnico — pendiente revisión legal
        </div>

        <header className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
            RGPD · LOPDGDD
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-4 leading-tight">
            Política de privacidad
          </h1>
          <p className="text-sm text-ink-2 leading-relaxed">
            Esta política describe cómo otracita trata los datos personales
            que entran por nuestra plataforma. Está escrita para que se
            entienda — si echas en falta algo, escríbenos a{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-brand hover:text-brand-strong font-medium"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </header>

        <section className="space-y-10 text-ink-2 leading-relaxed">
          <Block id="responsable" title="1. Responsable del tratamiento">
            <p>
              El responsable de los datos personales tratados a través de la
              plataforma <strong>otracita</strong> es{' '}
              <strong className="text-ink">Vanwida</strong>, sociedad titular
              del producto.
            </p>
            <ul className="mt-3 space-y-1">
              <li>
                <span className="text-ink-3">Marca comercial:</span>{' '}
                <strong className="text-ink">otracita</strong>
              </li>
              <li>
                <span className="text-ink-3">Contacto:</span>{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-brand hover:text-brand-strong font-mono"
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </Block>

          <Block id="finalidades" title="2. Finalidades del tratamiento">
            <p>Tratamos los datos personales con tres finalidades concretas:</p>
            <ul className="mt-3 list-disc pl-6 space-y-2">
              <li>
                <strong className="text-ink">Reserva y gestión de citas.</strong>{' '}
                Crear la reserva, recordársela al cliente, gestionar
                cancelaciones, ausencias y la facturación que pueda derivarse.
              </li>
              <li>
                <strong className="text-ink">Comunicaciones operativas.</strong>{' '}
                Confirmaciones, recordatorios y notificaciones del servicio
                contratado por la barbería con sus clientes.
              </li>
              <li>
                <strong className="text-ink">Marketing opcional.</strong> Solo
                con consentimiento explícito y revocable (p. ej. promociones
                del barbero al cliente final). Nunca cedemos datos a terceros
                con fines publicitarios.
              </li>
              <li>
                <strong className="text-ink">Gestión interna.</strong>{' '}
                Facturación a las barberías clientes, soporte técnico,
                detección de fraude y obligaciones legales (contables,
                tributarias y de prevención de blanqueo si aplican).
              </li>
            </ul>
          </Block>

          <Block id="base-legal" title="3. Base legal">
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-ink">Ejecución del contrato</strong>{' '}
                (art. 6.1.b RGPD) — para la reserva, la facturación y la
                prestación del servicio.
              </li>
              <li>
                <strong className="text-ink">Consentimiento</strong>{' '}
                (art. 6.1.a RGPD) — para comunicaciones de marketing y para
                tratamientos no necesarios para el servicio.
              </li>
              <li>
                <strong className="text-ink">Obligación legal</strong>{' '}
                (art. 6.1.c RGPD) — para emisión de facturas, registros
                tributarios (VeriFactu) y conservación contable.
              </li>
              <li>
                <strong className="text-ink">Interés legítimo</strong>{' '}
                (art. 6.1.f RGPD) — para seguridad de la plataforma, prevención
                de fraude y mejora del servicio (con ponderación favorable
                frente al impacto en el interesado).
              </li>
            </ul>
          </Block>

          <Block id="datos" title="4. Datos personales tratados">
            <p>
              Recogemos solo lo necesario para que el servicio funcione. En
              concreto:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-1.5">
              <li>Nombre y teléfono (obligatorios para reservar).</li>
              <li>Email (opcional, para confirmaciones).</li>
              <li>
                Historial de reservas en la barbería: servicio, barbero,
                fecha, importe, propinas y reseñas.
              </li>
              <li>
                Datos de pago tokenizados por Stripe (nunca almacenamos PAN
                completo en nuestros servidores).
              </li>
              <li>
                Mensajes de WhatsApp intercambiados con el bot de reservas,
                a efectos de continuidad de la conversación.
              </li>
              <li>
                Datos técnicos mínimos: dirección IP, identificador de
                navegador, idioma y atribución (UTM, referrer) cuando es
                relevante para entender de dónde viene cada reserva.
              </li>
            </ul>
          </Block>

          <Block id="sub-encargados" title="5. Destinatarios (sub-encargados)">
            <p>
              Para operar otracita usamos los siguientes prestadores
              tecnológicos. Todos están vinculados por contrato y procesan
              datos exclusivamente por cuenta nuestra:
            </p>
            <ul className="mt-3 space-y-2.5">
              {SUB_PROCESSORS.map((sp) => (
                <li
                  key={sp.name}
                  className="rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <strong className="text-ink">{sp.name}</strong>
                    <span className="text-[11px] font-medium uppercase tracking-widest text-ink-3">
                      {sp.country}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{sp.purpose}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-3">
              Las transferencias internacionales fuera del EEE se amparan en
              cláusulas contractuales tipo (SCC) aprobadas por la Comisión
              Europea u otras garantías equivalentes.
            </p>
          </Block>

          <Block id="derechos" title="6. Tus derechos (ARSULIPO)">
            <p>
              En cualquier momento puedes ejercer los siguientes derechos
              sobre tus datos:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-1.5">
              <li>
                <strong className="text-ink">Acceso</strong> — saber qué datos
                tenemos sobre ti.
              </li>
              <li>
                <strong className="text-ink">Rectificación</strong> — corregir
                datos inexactos.
              </li>
              <li>
                <strong className="text-ink">Supresión</strong> — pedir el
                borrado o anonimización (sujeto a obligaciones legales de
                conservación, p. ej. facturas).
              </li>
              <li>
                <strong className="text-ink">Limitación</strong> del
                tratamiento.
              </li>
              <li>
                <strong className="text-ink">Portabilidad</strong> — recibir
                tus datos en formato estructurado.
              </li>
              <li>
                <strong className="text-ink">Oposición</strong> — al
                tratamiento basado en interés legítimo o marketing.
              </li>
            </ul>
            <p className="mt-4">
              Para ejercerlos basta con escribir a{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-brand hover:text-brand-strong font-mono"
              >
                {CONTACT_EMAIL}
              </a>{' '}
              indicando el derecho que quieres ejercer. Responderemos en un
              plazo máximo de un mes.
            </p>
            <p className="mt-3 text-sm">
              También puedes reclamar ante la Agencia Española de Protección
              de Datos (
              <a
                href="https://www.aepd.es"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:text-brand-strong"
              >
                aepd.es
              </a>
              ) si consideras que tus derechos no han sido atendidos.
            </p>
          </Block>

          <Block id="retencion" title="7. Conservación de los datos">
            <p>
              Conservamos los datos personales el tiempo estrictamente
              necesario para las finalidades descritas. En particular:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-1.5">
              <li>
                Datos de reserva activos: durante la relación contractual.
              </li>
              <li>
                Datos de facturación: el plazo legal exigido por la
                normativa fiscal y contable (con carácter general, hasta 6
                años).
              </li>
              <li>
                Datos de marketing: hasta que el interesado retire el
                consentimiento.
              </li>
              <li>
                <strong className="text-ink">
                  Inactividad superior a 24 meses
                </strong>{' '}
                — propondremos al titular el borrado o anonimización de los
                datos no sujetos a obligaciones legales de conservación.
              </li>
            </ul>
          </Block>

          <Block id="seguridad" title="8. Seguridad">
            <p>
              Aplicamos medidas técnicas y organizativas razonables para
              proteger los datos: cifrado en tránsito (TLS), cifrado en
              reposo en los servicios gestionados, control de acceso por
              rol, registro de eventos y auditoría periódica. Ningún sistema
              es invulnerable; ante cualquier brecha actuaremos conforme a
              los artículos 33 y 34 del RGPD.
            </p>
          </Block>

          <Block id="cambios" title="9. Cambios en esta política">
            <p>
              Podemos actualizar esta política cuando cambien los
              tratamientos, los sub-encargados o la normativa aplicable. La
              versión vigente es siempre la publicada en esta URL. Cambios
              materiales se anunciarán a los interesados por el canal
              habitual.
            </p>
          </Block>
        </section>

        <footer className="mt-16 pt-8 border-t border-line text-sm text-ink-3">
          <p>Última revisión: {LAST_REVIEW}.</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
            <Link
              href="/"
              className="text-brand hover:text-brand-strong font-medium"
            >
              ← Volver a otracita
            </Link>
            <div className="flex gap-4">
              <Link href="/legal/verifactu" className="hover:text-ink-2">
                VeriFactu
              </Link>
              <Link href="/terminos" className="hover:text-ink-2">
                Términos
              </Link>
            </div>
          </div>
        </footer>
      </article>
    </main>
  )
}

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

function Block({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-xl md:text-2xl font-bold text-ink mb-3 leading-tight">
        {title}
      </h2>
      <div className="text-sm md:text-[0.9375rem]">{children}</div>
    </section>
  )
}
