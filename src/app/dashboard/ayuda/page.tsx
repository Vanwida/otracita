import { MessageCircle, Mail, HelpCircle, ExternalLink, ChevronDown } from 'lucide-react'

// Centralised so the Ayuda page mirrors the chat widget contact details.
const SUPPORT_WHATSAPP = '+34 644 288 663'
const SUPPORT_WHATSAPP_LINK = 'https://wa.me/34644288663?text=Hola%21%20Necesito%20ayuda%20con%20otracita'
const SUPPORT_EMAIL = 'soporte@otracita.es'

interface Faq {
  q: string
  a: React.ReactNode
}

interface FaqSection {
  title: string
  items: Faq[]
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="text-brand hover:text-brand-strong underline underline-offset-2"
      href={href}
    >
      {children}
    </a>
  )
}

const SECTIONS: FaqSection[] = [
  {
    title: 'Empezar',
    items: [
      {
        q: '¿Cuánto tarda en estar activo el bot?',
        a: (
          <>
            Menos de 48 horas desde que completas <Link href="/dashboard/negocio">Mi negocio</Link>. Nuestro equipo conecta el
            WhatsApp y hace el primer test. Tú solo tienes que dar los datos de tu negocio.
          </>
        ),
      },
      {
        q: '¿Tengo que dejar mi app de reservas actual?',
        a: (
          <>
            No. Puedes seguir usando la que tengas — el bot se sincroniza con ella por email. O puedes pasarte
            entero a otracita y dejar la otra: agenda, facturación y cobros lo cubren todo.
          </>
        ),
      },
    ],
  },
  {
    title: 'Agenda y reservas',
    items: [
      {
        q: '¿Dónde veo las reservas?',
        a: (
          <>
            En <Link href="/dashboard/agenda">Agenda</Link>. Tienes vista día/semana/mes y puedes filtrar por barbero.
            La agenda se refresca sola cada 10 segundos, así que cuando el bot mete una reserva no tienes que recargar.
          </>
        ),
      },
      {
        q: '¿Cómo sabe el bot qué huecos ofrecer?',
        a: (
          <>
            Mira el horario + días bloqueados de cada barbero y cruza con las reservas existentes. Si un barbero tiene
            horario propio (en Mi negocio → Equipo), usa ese; si no, hereda el del shop.
          </>
        ),
      },
      {
        q: '¿Y si un cliente elige "sin preferencia" de barbero?',
        a: (
          <>
            El bot asigna automáticamente al último barbero que atendió a ese cliente (si tiene hueco). Si es cliente
            nuevo, al primer barbero libre ordenado por tu lista de Equipo. Nunca guarda reservas sin barbero asignado.
          </>
        ),
      },
      {
        q: '¿Cómo marco que un cliente no vino?',
        a: (
          <>
            Abre la reserva en <Link href="/dashboard/agenda">Agenda</Link> y pulsa "Marcar no-show". Si tenía factura,
            se anula sola. El contador de no-shows del cliente sube en 1.
          </>
        ),
      },
      {
        q: 'Un cliente con no-shows volvió y se portó bien, ¿cómo le doy una segunda oportunidad?',
        a: (
          <>
            Dos formas: (1) Automático — cada cita completada baja el contador en 1. (2) Manual — en{' '}
            <Link href="/dashboard/clientes">Clientes</Link> pulsa "Perdonar" para reiniciarlo a 0.
          </>
        ),
      },
    ],
  },
  {
    title: 'Equipo y horarios',
    items: [
      {
        q: '¿Cada barbero puede tener su propio horario?',
        a: (
          <>
            Sí. En <Link href="/dashboard/negocio?tab=team">Mi negocio → Equipo</Link>, abre el barbero y activa "Horario
            personalizado". Ej: Juan L-V 10-20, Reni M-S 12-20. Si no activas nada, todos heredan el horario del negocio.
          </>
        ),
      },
      {
        q: '¿Y vacaciones o días libres de un barbero concreto?',
        a: (
          <>
            En la misma tarjeta de cada barbero, abajo, tienes "Días bloqueados personales". Añade fechas y el bot
            dejará de ofrecer citas con ese barbero esos días.
          </>
        ),
      },
      {
        q: '¿Puedo eliminar a un barbero?',
        a: (
          <>
            Sí, con el botón de papelera en la tarjeta. Si tiene reservas futuras confirmadas, te lo bloqueará — debes
            reasignarlas primero. Las reservas pasadas se conservan para el histórico.
          </>
        ),
      },
    ],
  },
  {
    title: 'Facturación',
    items: [
      {
        q: '¿Cómo activo las facturas?',
        a: (
          <>
            <Link href="/dashboard/negocio?tab=facturacion">Mi negocio → Facturación</Link>. Rellena nombre fiscal, NIF,
            dirección, código postal y ciudad. Sin estos cinco datos no podemos emitir por ley (Real Decreto 1619/2012).
          </>
        ),
      },
      {
        q: '¿Ticket o factura?',
        a: (
          <>
            Automático: si el cliente da NIF, factura completa. Si no, ticket simplificado. Se emite solo con cada
            reserva confirmada con precio.
          </>
        ),
      },
      {
        q: '¿Qué le mando al gestor cada mes?',
        a: (
          <>
            En <Link href="/dashboard/facturas">Facturación</Link> descarga 3 cosas: Libro PDF (legal), XLSX
            (Excel con Resumen + Facturas + Propinas separadas) y CSV. Adjunta al email del gestor y listo para el
            Modelo 303.
          </>
        ),
      },
      {
        q: '¿Y si anulo una reserva?',
        a: (
          <>
            La factura se marca como "anulada" automáticamente. No cuenta en tus totales ni en el libro del mes. Si ya
            cobraste, tendrás que emitir factura rectificativa manualmente (el gestor te dirá).
          </>
        ),
      },
    ],
  },
  {
    title: 'Cobros online (opcional)',
    items: [
      {
        q: '¿Qué son los cobros online?',
        a: (
          <>
            Cobrar con tarjeta sin comprar datáfono. Activas Stripe (10 min, DNI + IBAN online) y desde cualquier
            reserva generas un QR para que el cliente pague con tarjeta o Apple Pay. El dinero va directo a tu banco.
          </>
        ),
      },
      {
        q: '¿Cuánto cobra Stripe?',
        a: (
          <>
            1,5% + 0,25€ por transacción (tarjetas europeas estándar). otracita no cobra ninguna comisión extra sobre
            tus cobros. Ten en cuenta: con ticket medio bajo, puede salir más caro que un datáfono tradicional — úsalo
            para casos concretos (cliente sin efectivo, pago a distancia), no como reemplazo del datáfono si ya tienes.
          </>
        ),
      },
      {
        q: '¿Cuándo me llega el dinero?',
        a: (
          <>
            1-2 días hábiles en tu cuenta bancaria. Los primeros cobros pueden tardar hasta una semana (rolling reserve
            inicial de Stripe), después se estabiliza en diario.
          </>
        ),
      },
    ],
  },
  {
    title: 'Propinas y valoraciones',
    items: [
      {
        q: '¿Cómo activo propinas?',
        a: (
          <>
            Primero Stripe activo. Luego en <Link href="/dashboard/negocio?tab=cobros">Mi negocio → Cobros</Link> abajo
            encontrarás "Propinas y rating". Activa el toggle y define importes sugeridos (ej. 2€/3€/5€).
          </>
        ),
      },
      {
        q: '¿Cómo funciona?',
        a: (
          <>
            30 minutos después del corte, el bot escribe al cliente por WhatsApp: "¿Qué tal con Carlos? ⭐⭐⭐⭐⭐ +
            propina opcional". Si valora ≥4 ⭐, le ofrece dejar propina por tarjeta. Si valora ≤3 ⭐, solo agradece sin
            pedir propina (evita situaciones incómodas).
          </>
        ),
      },
      {
        q: '¿Dónde veo las propinas?',
        a: (
          <>
            En el XLSX mensual hay una hoja aparte "Propinas recibidas" con fecha, barbero e importe. Fiscalmente son
            renta del negocio — tu gestor las incluirá en IRPF (no en IVA).
          </>
        ),
      },
    ],
  },
  {
    title: 'Suscripción',
    items: [
      {
        q: '¿Cómo cancelo?',
        a: (
          <>
            <Link href="/dashboard/mi-plan">Mi plan</Link> → "Gestionar suscripción". Abre el portal de Stripe y cancelas
            en 1 click. Mantienes acceso hasta el final del periodo que tenías pagado.
          </>
        ),
      },
      {
        q: '¿Hay permanencia?',
        a: 'Ninguna. Mes a mes. Sin letra pequeña.',
      },
      {
        q: '¿Qué pasa si cancelo con reservas futuras?',
        a: (
          <>
            El bot deja de responder mensajes, pero tus datos se conservan. Si vuelves más adelante, los recuperas. Las
            reservas ya confirmadas siguen en tu agenda actual si tenías sync activo.
          </>
        ),
      },
    ],
  },
]

export default function AyudaPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">Ayuda</h1>
        <p className="text-ink-2">
          Contáctanos directo o revisa las preguntas más habituales. También tienes el chat-widget abajo a la derecha
          para dudas rápidas.
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
        {SECTIONS.map((section) => (
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
                  <div className="mt-3 text-sm text-ink-2 leading-relaxed">{faq.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
