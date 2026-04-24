import Link from 'next/link'
import type { Metadata } from 'next'
import { Wordmark } from '@/components/brand'

// -----------------------------------------------------------------------------
// /legal/verifactu — Declaración Responsable pública del SIF otracita conforme
// al RD 1007/2023 art. 13 y al modelo publicado por la AEAT
// (EjemplosDeclaracionResponsable V0.5.1).
//
// Estructura 1:1 con la plantilla oficial AEAT. Todos los apartados 1.a-1.l
// del cuerpo + ANEXO 2.a-2.c. Reenumeración de "entidad productora" a
// "persona productora" por ser Alex persona física (ver footnote i de la
// plantilla AEAT).
//
// Esta URL se sirve públicamente y es la fuente de verdad: AEAT o cualquier
// barbero puede consultarla para confirmar que otracita cumple. También se
// linka desde /dashboard/facturas (panel educativo VeriFactu).
//
// Cambios en esta DR → bump CURRENT.version + CURRENT.fecha + entrada en
// HISTORY. NUNCA borrar versiones históricas (el apartado 2.b de la propia
// DR obliga a mantener el histórico accesible).
// -----------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Declaración Responsable VeriFactu — otracita',
  description:
    'Declaración Responsable del Sistema Informático de Facturación otracita conforme al Real Decreto 1007/2023 y la Orden HAC/1177/2024.',
}

// ─── Datos del SIF (ground truth verificado contra el código) ───────────────
// 1.a — nombre: mismo valor que `VERIFACTU_SIF_NAME` en src/lib/verifactu/xml.ts.
// 1.b — código 2 chars mismo valor que `VERIFACTU_SIF_ID`. Alfanumérico A-Z/0-9.
// 1.c — versión: bumpeamos manualmente en cada cambio de la DR.
const SIF = {
  nombre: 'otracita',
  idSistemaInformatico: '01',
  version: '1.0.0',
  fechaVersion: '24 de abril de 2026',
}

// ─── Datos de la persona productora ─────────────────────────────────────────
// Alex es persona física (no entidad). Conforme a la footnote i de la
// plantilla AEAT, en 1.h ponemos "Nombre y apellidos", y en 1.i, 1.j, 1.k,
// 1.l decimos "persona productora" en vez de "entidad productora".
//
// Los campos marcados PENDIENTE los tiene que rellenar Alex — sin estos
// valores la DR no es firmable. Sustituir los literales y redeployar.
const PRODUCTOR = {
  nombreCompleto: '[PENDIENTE: nombre y apellidos legales de Alex]',
  nif: '[PENDIENTE: NIF]',
  direccion: [
    '[PENDIENTE: calle y número]',
    '[PENDIENTE: CP — ciudad (provincia)]',
    'España',
  ],
  telefono: '[PENDIENTE: teléfono]',
  email: 'hola@otracita.es',
  marcaComercial: 'AI Studios (Vanwida)',
  sitioWeb: 'https://otracita.es',
  urlProducto: 'https://otracita.es',
  urlHistoricoDR: 'https://otracita.es/legal/verifactu/historico',
}

// ─── Fecha y lugar de suscripción (1.l) ─────────────────────────────────────
const SUSCRIPCION = {
  fecha: '24 de abril de 2026',
  lugar: 'Barcelona — España',
}

// ─── Histórico de versiones (obligatorio por apartado 2.b) ─────────────────
const HISTORY: Array<{
  version: string
  fecha: string
  cambios: string
}> = [
  {
    version: '1.0.0',
    fecha: '24 de abril de 2026',
    cambios: 'Versión inicial de la Declaración Responsable.',
  },
]

export default function VerifactuLegalPage() {
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
        <header className="mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2">
            RD 1007/2023 · Orden HAC/1177/2024 · Art. 13
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-4 leading-tight">
            Declaración Responsable<br />del Sistema Informático de Facturación
          </h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-ink-2">
            <dt className="text-ink-3">Versión de la DR:</dt>
            <dd className="font-mono">{SIF.version}</dd>
            <dt className="text-ink-3">Fecha de suscripción:</dt>
            <dd>{SUSCRIPCION.fecha}</dd>
            <dt className="text-ink-3">URL canónica:</dt>
            <dd className="font-mono break-all">https://otracita.es/legal/verifactu</dd>
          </dl>
        </header>

        <section className="space-y-7 text-ink-2 leading-relaxed">
          <Apartado
            id="1a"
            label="1.a) Nombre del sistema informático a que se refiere esta declaración responsable:"
          >
            <strong className="text-ink">{SIF.nombre}</strong>
          </Apartado>

          <Apartado
            id="1b"
            label="1.b) Código identificador del sistema informático a que se refiere el apartado a) de esta declaración responsable:"
          >
            <strong className="text-ink font-mono">{SIF.idSistemaInformatico}</strong>
          </Apartado>

          <Apartado
            id="1c"
            label="1.c) Identificador completo de la versión concreta del sistema informático a que se refiere esta declaración responsable:"
          >
            <strong className="text-ink font-mono">{SIF.version}</strong>{' '}
            <span className="text-ink-3">(fecha de versión: {SIF.fechaVersion})</span>
          </Apartado>

          <Apartado
            id="1d"
            label="1.d) Componentes, hardware y software, de que consta el sistema informático a que se refiere esta declaración responsable, junto con una breve descripción de lo que hace dicho sistema informático y de sus principales funcionalidades:"
          >
            <p>
              Se trata de una aplicación <strong>SaaS multi-tenant</strong> accesible vía
              web ({PRODUCTOR.sitioWeb}) que permite a sus usuarios (obligados tributarios
              del sector servicios, típicamente barberías y similares) <strong>capturar,
              expedir, consultar y exportar facturas</strong> de forma íntegra, a la vez
              que genera, encadena y remite los correspondientes registros de facturación
              y de eventos a la Agencia Estatal de Administración Tributaria.
            </p>
            <p className="mt-3">
              <strong>Arquitectura técnica:</strong>
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>
                <strong>Cloud-only.</strong> No hay instalación local ni on-premise — el
                SIF se ejecuta íntegramente en infraestructura propia del productor
                (Next.js 16 sobre Vercel; base de datos PostgreSQL serverless en Neon).
              </li>
              <li>
                <strong>Cliente ligero.</strong> Los usuarios acceden desde un navegador
                moderno en PC/Mac/tablet/móvil, o desde la Progressive Web App instalable,
                sin software adicional.
              </li>
              <li>
                <strong>Consolidación transaccional.</strong> La expedición de cada
                factura y la generación del correspondiente registro de facturación
                (incluyendo hash SHA-256 y encadenamiento con la factura anterior) se
                ejecutan dentro de la misma transacción de base de datos, garantizando
                atomicidad por serialización (<em>pg_advisory_xact_lock</em>).
              </li>
              <li>
                <strong>Bot conversacional WhatsApp.</strong> Como canal alternativo para
                que los clientes del obligado tributario reserven cita; la emisión de la
                factura se realiza siempre por el SIF, no por el canal.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Funcionalidades principales:</strong> captura y expedición de
              facturas y facturas rectificativas, consulta, anulación, exportación (PDF,
              Excel, CSV), libro de facturas, estadísticas de facturación, generación
              automática de QR tributario en cada factura, y remisión automática a la
              AEAT en modo VERI*FACTU.
            </p>
            <p className="mt-3">
              Este software permite gestionar de forma independiente varias facturaciones
              dentro de él, cumpliendo separadamente con la normativa mencionada en el
              apartado 1.k) de esta declaración responsable para cada una de ellas, como
              si, en la práctica, se tratara de sistemas informáticos de facturación
              distintos.
            </p>
          </Apartado>

          <Apartado
            id="1e"
            label="1.e) Indicación de si el sistema informático a que se refiere esta declaración responsable se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI*FACTU»:"
          >
            <strong className="text-ink">S - Sí</strong>
          </Apartado>

          <Apartado
            id="1f"
            label="1.f) Indicación de si el sistema informático a que se refiere la declaración responsable permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios:"
          >
            <strong className="text-ink">S - Sí</strong>
          </Apartado>

          <Apartado
            id="1g"
            label="1.g) Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático a que se refiere esta declaración responsable no sea utilizado como «VERI*FACTU»:"
          >
            <p>
              Dado que se trata de un producto de facturación que solo puede ser utilizado
              exclusivamente en la modalidad de «VERI*FACTU», no se realiza una firma
              electrónica expresa de los registros de facturación generados, ya que la
              normativa considera que quedan firmados al ser remitidos correctamente a
              los servicios electrónicos de la Agencia Tributaria con la debida
              autenticación mediante el adecuado certificado electrónico cualificado.
            </p>
          </Apartado>

          <Apartado
            id="1h"
            label="1.h) Nombre y apellidos de la persona productora del sistema informático a que se refiere esta declaración responsable:"
          >
            <strong className="text-ink">{PRODUCTOR.nombreCompleto}</strong>
            <p className="mt-1 text-xs text-ink-3">
              Actúa bajo la marca comercial «{PRODUCTOR.marcaComercial}».
            </p>
          </Apartado>

          <Apartado
            id="1i"
            label="1.i) Número de identificación fiscal (NIF) español de la persona productora del sistema informático a que se refiere esta declaración responsable:"
          >
            <strong className="text-ink font-mono">{PRODUCTOR.nif}</strong>
          </Apartado>

          <Apartado
            id="1j"
            label="1.j) Dirección postal completa de contacto de la persona productora del sistema informático a que se refiere esta declaración responsable:"
          >
            <div>
              {PRODUCTOR.direccion.map((linea) => (
                <div key={linea} className="text-ink">{linea}</div>
              ))}
            </div>
          </Apartado>

          <Apartado
            id="1k"
            label="1.k) Declaración de cumplimiento normativo:"
          >
            <p>
              La persona productora del sistema informático a que se refiere esta
              declaración responsable hace constar que dicho sistema informático, en la
              versión indicada en ella, <strong>cumple con lo dispuesto en el artículo
              29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria</strong>,
              en el Reglamento que establece los requisitos que deben adoptar los
              sistemas y programas informáticos o electrónicos que soporten los procesos
              de facturación de empresarios y profesionales, y la estandarización de
              formatos de los registros de facturación,{' '}
              <strong>aprobado por el Real Decreto 1007/2023, de 5 de diciembre</strong>,
              en la <strong>Orden HAC/1177/2024, de 17 de octubre</strong>, y en la sede
              electrónica de la Agencia Estatal de Administración Tributaria para todo
              aquello que complete las especificaciones de dicha orden.
            </p>
          </Apartado>

          <Apartado id="1l" label="1.l) Fecha y lugar de suscripción:">
            <div>
              <strong className="text-ink">Fecha:</strong> {SUSCRIPCION.fecha}.
            </div>
            <div>
              <strong className="text-ink">Lugar:</strong> {SUSCRIPCION.lugar}.
            </div>
          </Apartado>
        </section>

        <hr className="my-12 border-line" />

        <section className="space-y-7 text-ink-2 leading-relaxed">
          <h2 className="font-display text-2xl font-bold text-ink mb-6">ANEXO</h2>

          <Apartado
            id="2a"
            label="2.a) Otras formas de contacto con la persona productora del sistema informático a que se refiere esta declaración responsable:"
          >
            <ul className="space-y-1">
              <li>
                <span className="text-ink-3">Teléfono:</span>{' '}
                <strong className="text-ink font-mono">{PRODUCTOR.telefono}</strong>
              </li>
              <li>
                <span className="text-ink-3">Correo electrónico:</span>{' '}
                <a
                  href={`mailto:${PRODUCTOR.email}`}
                  className="text-brand hover:text-brand-strong font-mono"
                >
                  {PRODUCTOR.email}
                </a>
              </li>
            </ul>
          </Apartado>

          <Apartado
            id="2b"
            label="2.b) Direcciones de internet de la persona productora del sistema informático a que se refiere esta declaración responsable:"
          >
            <ul className="space-y-2">
              <li>
                <div className="text-ink-3 text-sm">Sitio web:</div>
                <a
                  href={PRODUCTOR.sitioWeb}
                  className="text-brand hover:text-brand-strong font-mono text-sm break-all"
                >
                  {PRODUCTOR.sitioWeb}
                </a>
              </li>
              <li>
                <div className="text-ink-3 text-sm">Información sobre este producto:</div>
                <a
                  href={PRODUCTOR.urlProducto}
                  className="text-brand hover:text-brand-strong font-mono text-sm break-all"
                >
                  {PRODUCTOR.urlProducto}
                </a>
              </li>
              <li>
                <div className="text-ink-3 text-sm">
                  Histórico de declaraciones responsables de las versiones de este
                  producto:
                </div>
                <a
                  href={PRODUCTOR.urlHistoricoDR}
                  className="text-brand hover:text-brand-strong font-mono text-sm break-all"
                >
                  {PRODUCTOR.urlHistoricoDR}
                </a>
              </li>
            </ul>
          </Apartado>

          <Apartado
            id="2c"
            label="2.c) El sistema informático a que se refiere esta declaración responsable cumple las diferentes especificaciones técnicas y funcionales contenidas en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden, de la siguiente manera:"
          >
            <p>
              Además del modo que es de obligado cumplimiento en ciertos casos (como el
              algoritmo de huella a emplear), otras implementaciones utilizadas son:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Consolidación transaccional.</strong> Empleo de transacciones de
                base de datos (PostgreSQL serializable con bloqueo advisory por obligado
                tributario) para lograr la consolidación, en una sola unidad
                transaccional, de la expedición de la factura y la generación del
                registro de facturación correspondiente a la factura.
              </li>
              <li>
                <strong>Algoritmo de huella.</strong> SHA-256 conforme al apartado 6 del
                anexo de la Orden HAC/1177/2024. La entrada del hash se construye
                respetando el orden y los separadores literales (<code>=</code>,{' '}
                <code>&amp;</code>) y aplicando las normalizaciones especificadas
                (trimming de espacios, vacío → cadena vacía, enlace al hash anterior de la
                cadena del mismo obligado tributario).
              </li>
              <li>
                <strong>Encadenamiento resistente a concurrencia.</strong> Uso de{' '}
                <code>pg_advisory_xact_lock</code> a nivel de obligado tributario para
                garantizar que no se producen huecos ni bifurcaciones en la cadena de
                hashes incluso bajo emisión concurrente.
              </li>
              <li>
                <strong>QR tributario en cada factura.</strong> Generación automática del
                código QR conforme al apartado 3 del anexo de la Orden HAC/1177/2024,
                con URL base de la sede electrónica de la AEAT y parámetros{' '}
                <code>nif</code>, <code>numserie</code>, <code>fecha</code> e{' '}
                <code>importe</code> codificados por URL.
              </li>
              <li>
                <strong>Remisión automática en modo VERI*FACTU.</strong> Envío en tiempo
                próximo al real (sin acción manual del obligado tributario) al servicio
                web de la AEAT mediante SOAP firmado con certificado electrónico
                cualificado. Política de reintentos con espera exponencial ante errores
                técnicos.
              </li>
              <li>
                <strong>Registro de eventos.</strong> Registro automático de los eventos
                relevantes exigidos por la Orden (alta, anulación, rectificación,
                incidencias de remisión).
              </li>
              <li>
                <strong>Integridad de datos.</strong> Numeración correlativa sin huecos
                por serie y obligado tributario; no existe en el producto ninguna
                funcionalidad que permita la eliminación, modificación o backdating de
                un registro de facturación ya emitido — la corrección se realiza
                exclusivamente mediante factura rectificativa referenciando la original.
              </li>
              <li>
                <strong>Multi-tenant estanco.</strong> Cada obligado tributario dispone
                de su propia cadena de hashes, numeración y libro de facturas. Los datos
                no se cruzan entre obligados.
              </li>
              <li>
                <strong>Trazabilidad de versión.</strong> Cada cambio del SIF genera una
                nueva versión publicada junto con la Declaración Responsable
                correspondiente, accesible en{' '}
                <a
                  href={PRODUCTOR.urlHistoricoDR}
                  className="text-brand hover:text-brand-strong font-mono"
                >
                  {PRODUCTOR.urlHistoricoDR}
                </a>
                .
              </li>
            </ul>
          </Apartado>
        </section>

        <hr className="my-12 border-line" />

        <section>
          <h2 className="font-display text-2xl font-bold text-ink mb-6">
            Histórico de versiones
          </h2>
          <ol className="space-y-4">
            {HISTORY.map((entry) => (
              <li
                key={entry.version}
                className="border-l-2 border-line pl-4 py-1"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono font-bold text-ink">{entry.version}</span>
                  <span className="text-xs text-ink-3">{entry.fecha}</span>
                </div>
                <p className="text-sm text-ink-2 mt-1">{entry.cambios}</p>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-3 mt-6">
            Las versiones anteriores se mantienen accesibles de forma permanente en{' '}
            <a
              href={PRODUCTOR.urlHistoricoDR}
              className="text-brand hover:text-brand-strong font-mono"
            >
              {PRODUCTOR.urlHistoricoDR}
            </a>{' '}
            conforme al apartado 2.b) de esta declaración responsable.
          </p>
        </section>

        <footer className="mt-16 pt-8 border-t border-line text-sm text-ink-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="text-brand hover:text-brand-strong font-medium">
              ← Volver a otracita
            </Link>
            <div className="flex gap-4">
              <Link href="/terminos" className="hover:text-ink-2">
                Términos
              </Link>
              <Link href="/privacidad" className="hover:text-ink-2">
                Privacidad
              </Link>
              <Link href="/aviso-legal" className="hover:text-ink-2">
                Aviso legal
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

function Apartado({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-20">
      <p className="text-sm text-ink-3 mb-2 leading-snug">{label}</p>
      <div className="pl-4 border-l-2 border-brand/30">{children}</div>
    </div>
  )
}
