"use client";

import { motion } from "framer-motion";
import FaqAccordion from "@/components/faq-accordion";
import PricingCards from "@/components/pricing-cards";
import VideoSection from "@/components/video-section";
import ChatWidget from "@/components/chat-widget";
import { Wordmark } from "@/components/brand";

const WHATSAPP_URL =
  "https://wa.me/34684000939?text=Hola!%20Me%20interesa%20otracita%20para%20mi%20negocio";

const FEATURES = [
  {
    emoji: "🗓️",
    title: "Reservas automáticas",
    description:
      "El bot gestiona el flujo entero: servicio → barbero → día → hora → confirmación. Sincronizado con tu Booksy.",
  },
  {
    emoji: "🧾",
    title: "Facturación automática",
    description:
      "Tickets y facturas se emiten solos con cada reserva. Exporta un PDF mensual para tu gestor — listo para el Modelo 303.",
  },
  {
    emoji: "💳",
    title: "Cobros online con QR",
    description:
      "Genera un QR desde la agenda, el cliente paga con tarjeta o Apple Pay desde su móvil. Sin datáfono.",
  },
  {
    emoji: "🏪",
    title: "Walk-ins en segundos",
    description:
      "Cliente sin cita que entra y paga. Factura generada en 10 segundos desde el móvil del barbero.",
  },
  {
    emoji: "🔔",
    title: "Recordatorios 24h",
    description:
      "El bot avisa el día antes. El cliente confirma o cancela desde el propio WhatsApp — menos no-shows.",
  },
  {
    emoji: "❌",
    title: "Cancelaciones y cambios",
    description:
      "Clientes reagendan sin que toques el móvil. El hueco se libera al instante y si hay lista de espera, se rellena solo.",
  },
  {
    emoji: "🌍",
    title: "Bilingüe ES/EN",
    description:
      "Detecta el idioma automáticamente. Hecho a medida para el turismo de Barcelona.",
  },
  {
    emoji: "📊",
    title: "Panel para el barbero",
    description:
      "Agenda unificada Booksy + WhatsApp, clientes, facturas, cobros. Todo en un solo sitio.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-canvas)] text-[var(--color-ink)]">
      {/* Soft ambient tint */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--color-brand-softer)] blur-[120px] pointer-events-none opacity-60" />
      <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[var(--color-gold-soft)] blur-[150px] pointer-events-none opacity-40" />

      {/* ─── Nav ─── */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-6 mx-auto max-w-6xl">
        <a href="/" className="flex items-center group text-[var(--color-ink)]">
          <Wordmark height={36} />
        </a>
        <div className="flex items-center gap-6">
          <a href="#como-funciona" className="hidden sm:block text-sm font-medium text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors">
            Cómo funciona
          </a>
          <a
            href="#precios"
            className="rounded-full bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--color-brand-strong)]"
          >
            Ver precios
          </a>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-20 pb-24 text-center">
        <div className="relative z-10 mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-2)]"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-brand)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-brand)]"></span>
            </span>
            Hecho en Barcelona · ES+EN
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)] sm:text-6xl md:text-7xl lg:text-[80px]"
          >
            Que no se te escape <br className="hidden sm:block" />
            <span className="text-[var(--color-brand)] italic">otra cita.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-8 max-w-2xl text-lg text-[var(--color-ink-2)] sm:text-xl leading-relaxed"
          >
            La recepcionista de IA que contesta por WhatsApp, cierra reservas solo, <span className="text-[var(--color-ink)] font-medium">emite la factura automáticamente</span> y cobra por QR si te hace falta. Todo sin tocar el móvil ni cambiar de Booksy.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href="#precios"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-brand)] px-8 py-4 text-base font-semibold text-white shadow-[0_8px_30px_rgba(201,101,60,0.2)] transition-all hover:scale-105 hover:bg-[var(--color-brand-strong)]"
            >
              Probar 7 días gratis
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>
            <a
              href="#como-funciona"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-line-strong)] px-8 py-4 text-base font-semibold text-[var(--color-ink)] transition-all hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            >
              Ver cómo funciona
            </a>
          </motion.div>
        </div>

        {/* Video */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          id="video-section"
          className="relative z-10 mt-20 w-full max-w-4xl"
        >
          <div className="absolute -inset-1 rounded-3xl bg-[var(--color-brand-softer)] blur-xl opacity-50" />
          <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-[0_20px_60px_rgba(42,29,20,0.08)] relative overflow-hidden">
            <VideoSection />
          </div>
        </motion.div>
      </section>

      {/* ─── Problem Section ─── */}
      <section className="relative z-20 border-y border-[var(--color-line)] bg-[var(--color-overlay)] px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-20">
            <h2 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              Las tijeras y el móvil no se llevan bien
            </h2>
            <p className="mt-4 text-[var(--color-ink-2)] text-lg">No puedes cortar el pelo y contestar al mismo tiempo.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <ProblemCard
              icon={<ScissorsIcon />}
              title="Mensajes en visto"
              description="Estás atendiendo. Te escriben para reservar. Tardas en responder y se van a la competencia."
              delay={0.1}
            />
            <ProblemCard
              icon={<ClockIcon />}
              title="Dinero por la ventana"
              description="Cada chat sin respuesta es un cliente que se va a la competencia. 3 ó 4 al mes son cientos de euros tirados."
              delay={0.2}
            />
            <ProblemCard
              icon={<ChartDownIcon />}
              title="Estrés después del cierre"
              description="Llegas a casa cansado y en vez de descansar, respondes 40 mensajes para cerrar la agenda del día siguiente."
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ─── Solution Section ─── */}
      <section id="como-funciona" className="relative z-20 px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-20">
            <span className="text-[var(--color-brand)] font-semibold tracking-wider uppercase text-sm">
              La solución
            </span>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              Así funciona otracita
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 relative">
            <div className="hidden sm:block absolute top-[44px] left-1/6 right-1/6 h-[2px] bg-gradient-to-r from-[var(--color-brand)]/0 via-[var(--color-brand)]/30 to-[var(--color-brand)]/0 z-0" />

            <StepCard
              step={1}
              title="Conectamos tu Booksy"
              description="Te configuramos la sincronización por email para que Booksy y otracita hablen entre ellos. Nosotros lo montamos, tú no tocas nada."
              delay={0.1}
            />
            <StepCard
              step={2}
              title="WhatsApp responde solo"
              description="Cuando un cliente te escribe, la IA charla, consulta tu agenda real y le ofrece huecos libres al instante. Bilingüe ES/EN."
              delay={0.3}
            />
            <StepCard
              step={3}
              title="Tú solo cortas"
              description="Las reservas entran solas en tu Booksy. Todo automatizado, cero sorpresas, cero dobles citas."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section className="relative z-20 border-y border-[var(--color-line)] bg-[var(--color-overlay)] px-6 py-32">
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-[var(--color-brand)] font-semibold tracking-wider uppercase text-sm">
              Qué hace tu bot
            </span>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              Todo incluido desde el primer día
            </h2>
            <p className="mt-4 text-lg text-[var(--color-ink-2)]">
              Sin configuración extra. Sin upsells. Sin asteriscos.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: (index % 2) * 0.1 + Math.floor(index / 2) * 0.05 }}
                className="border border-[var(--color-line)] bg-[var(--color-surface)] rounded-2xl p-5 flex items-start gap-4 transition-all hover:border-[var(--color-brand)] hover:shadow-[0_8px_24px_rgba(201,101,60,0.08)]"
              >
                <span className="text-2xl shrink-0 mt-0.5" aria-hidden="true">
                  {feature.emoji}
                </span>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-ink)]">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-2)]">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Anti-Booksy / Suite completa ─── */}
      <section className="relative z-20 px-6 py-32 bg-[var(--color-canvas)]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-[var(--color-brand)] font-semibold tracking-wider uppercase text-sm">
              Más que un bot
            </span>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              La suite que Booksy no te da
            </h2>
            <p className="mt-4 text-lg text-[var(--color-ink-2)] max-w-2xl mx-auto">
              Reservas, facturación y cobros en una sola herramienta. Lo que antes resolvías con 3 apps, aquí en una.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <SuiteCard
              eyebrow="24/7"
              title="Reservas por WhatsApp"
              description="Tus clientes reservan chateando, sin app ni descargas. El bot sincroniza con Booksy si ya lo usas."
              points={["Bot bilingüe ES/EN", "Lista de espera automática", "Recordatorios 24h"]}
            />
            <SuiteCard
              eyebrow="Para tu gestor"
              title="Facturación automática"
              description="Tickets y facturas se emiten solos con cada reserva. Libro PDF mensual listo para el Modelo 303."
              points={["Export Excel gestor-friendly", "Datos fiscales del emisor", "Libro de Facturas Emitidas"]}
            />
            <SuiteCard
              eyebrow="Sin datáfono"
              title="Cobros online opcionales"
              description="QR desde la agenda, el cliente paga con tarjeta o Apple Pay desde su móvil. Si ya tienes datáfono, lo ignoras."
              points={["Tu dinero va directo a tu banco", "QR o link por WhatsApp", "Seña al reservar (próximamente)"]}
            />
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-[var(--color-ink-2)]">
              <span className="font-semibold text-[var(--color-ink)]">Deja Booksy o úsalo junto con nosotros.</span> Tú decides.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Trust Section ─── */}
      <section className="relative overflow-hidden border-y border-[var(--color-line)] bg-[var(--color-overlay)] px-6 py-24">
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
            Sin fricción, sin letra pequeña
          </h2>
          <p className="mt-4 text-[var(--color-ink-2)] text-lg">Tecnología que funciona. Trato humano cuando lo necesitas.</p>

          <div className="mt-12 grid gap-4 text-left sm:grid-cols-2">
            <TrustPoint text="Cancelas cuando quieras, sin permanencia" />
            <TrustPoint text="Te activamos nosotros en menos de 48h" />
            <TrustPoint text="Bot bilingüe ES/EN para el turismo" />
            <TrustPoint text="Libro PDF para tu gestor cada mes" />
            <TrustPoint text="Cobra con QR sin tener que comprar datáfono" />
            <TrustPoint text="Soporte real por WhatsApp, no un formulario" />
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="precios" className="relative z-20 px-6 py-32 bg-[var(--color-overlay)]">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              Un precio. Todo incluido.
            </h2>
            <p className="mt-4 text-[var(--color-ink-2)]">Bot · facturación · cobros. Si salva a 1 cliente al mes, ya se paga solo.</p>
          </div>
          <PricingCards />
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="bg-[var(--color-canvas)] px-6 py-24 border-t border-[var(--color-line)]">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] sm:text-5xl">
              Preguntas frecuentes
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="relative px-6 py-32 text-center border-t border-[var(--color-line)] overflow-hidden bg-[var(--color-brand-softer)]">
        <div className="relative z-10 mx-auto max-w-3xl">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-ink)] md:text-5xl">
            La competencia ya no deja mensajes sin leer.
          </h2>
          <p className="mt-6 text-xl text-[var(--color-ink-2)]">
            Ponte a la altura en 48h. Sin permanencia.
          </p>
          <div className="mt-12">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-full bg-[var(--color-brand)] px-8 py-5 text-lg font-bold text-white shadow-[0_12px_40px_rgba(201,101,60,0.25)] transition-all hover:scale-105 hover:bg-[var(--color-brand-strong)]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 transition-transform group-hover:rotate-12">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Hablemos por WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[var(--color-line)] bg-[var(--color-canvas)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <a href="/" className="flex items-center text-[var(--color-ink)]">
                <Wordmark height={32} />
              </a>
              <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-2)] max-w-xs">
                La recepcionista de IA que no deja escapar ni una cita. Hecho en Barcelona para barberías de Barcelona.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink)]">Producto</h4>
              <ul className="mt-4 space-y-3">
                <li><a href="#como-funciona" className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-brand)] transition-colors">Cómo funciona</a></li>
                <li><a href="#precios" className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-brand)] transition-colors">Precios</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink)]">Contacto</h4>
              <ul className="mt-4 space-y-3">
                <li className="text-sm text-[var(--color-ink-2)]">Barcelona, España</li>
                <li><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-brand)] transition-colors">Soporte por WhatsApp</a></li>
                <li><a href="https://aistudios.pro" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-brand)] hover:text-[var(--color-brand-strong)] transition-colors font-medium">By AI Studios</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-[var(--color-line)] pt-8 sm:flex-row">
            <p className="text-sm text-[var(--color-ink-3)]">&copy; {new Date().getFullYear()} otracita. Todos los derechos reservados.</p>
            <div className="flex items-center gap-4 text-sm">
              <a href="/privacidad" className="text-[var(--color-ink-3)] hover:text-[var(--color-brand)] transition-colors">Privacidad</a>
              <span className="text-[var(--color-line-strong)]">·</span>
              <a href="/terminos" className="text-[var(--color-ink-3)] hover:text-[var(--color-brand)] transition-colors">Términos</a>
              <span className="text-[var(--color-line-strong)]">·</span>
              <a href="/aviso-legal" className="text-[var(--color-ink-3)] hover:text-[var(--color-brand)] transition-colors">Aviso legal</a>
            </div>
          </div>
        </div>
      </footer>
      <ChatWidget />
    </main>
  );
}

/* ─── Components / Icons ─── */

function ProblemCard({ icon, title, description, delay }: { icon: React.ReactNode; title: string; description: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay }}
      className="card card-hover p-8 group relative overflow-hidden"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-brand-softer)] text-[var(--color-brand)] group-hover:border-[var(--color-brand)] transition-all">
        {icon}
      </div>
      <h3 className="mt-6 text-xl font-bold tracking-tight text-[var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-2)]">{description}</p>
    </motion.div>
  );
}

function StepCard({ step, title, description, delay }: { step: number; title: string; description: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, delay }}
      className="relative z-10 flex flex-col items-center text-center p-6"
    >
      <div className="flex h-20 w-24 items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--color-brand)]/30 bg-[var(--color-surface)] font-display text-2xl font-semibold text-[var(--color-brand)] z-10">
          0{step}
        </div>
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-tight text-[var(--color-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-2)] max-w-sm">{description}</p>
    </motion.div>
  );
}

function TrustPoint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6 transition-colors hover:border-[var(--color-brand)]">
      <svg className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-[var(--color-ink)] font-medium">{text}</span>
    </div>
  );
}

function SuiteCard({
  eyebrow,
  title,
  description,
  points,
}: {
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5 }}
      className="card card-hover p-8 flex flex-col"
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-brand)]">
        {eyebrow}
      </span>
      <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-2)]">
        {description}
      </p>
      <ul className="mt-5 space-y-2 text-sm text-[var(--color-ink-2)]">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function ScissorsIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.165 2.165 0 011.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 01-5.196 3 3 3 0 015.196-3zm1.536-.887a2.165 2.165 0 001.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863l2.077-1.199m0-3.328a4.323 4.323 0 012.068-1.379l5.325-1.628a4.5 4.5 0 012.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.331 4.331 0 0010.607 12m3.736 0l7.794 4.5-.802.215a4.5 4.5 0 01-2.48-.043l-5.326-1.629a4.324 4.324 0 01-2.068-1.379M14.343 12l-2.882 1.664" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChartDownIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}
