"use client";

import { motion } from "framer-motion";
import FaqAccordion from "@/components/faq-accordion";
import PricingCards from "@/components/pricing-cards";
import VideoSection from "@/components/video-section";
import ChatWidget from "@/components/chat-widget";

const WHATSAPP_URL =
  "https://wa.me/34684000939?text=Hola!%20Me%20interesa%20el%20chatbot%20de%20Agendalo%20para%20mi%20negocio";

const FEATURES = [
  {
    emoji: "🗓️",
    title: "Reservas automáticas",
    description:
      "El bot gestiona el flujo completo: servicio → barbero → día → hora → confirmación, sincronizado con Google Calendar.",
  },
  {
    emoji: "❌",
    title: "Cancelaciones y cambios",
    description:
      "Los clientes pueden cancelar o reagendar sin que toques el móvil.",
  },
  {
    emoji: "🔔",
    title: "Recordatorios 24h",
    description:
      "El bot avisa automáticamente el día antes. El cliente puede confirmar o cancelar desde el propio mensaje.",
  },
  {
    emoji: "📋",
    title: "Lista de espera",
    description:
      "Si se cancela una cita, el siguiente en la lista recibe un aviso automático.",
  },
  {
    emoji: "🧠",
    title: "Memoria de clientes",
    description:
      "Reconoce a los clientes que vuelven y los saluda por su nombre.",
  },
  {
    emoji: "🌍",
    title: "Bilingüe ES/EN",
    description:
      "Detecta el idioma del cliente automáticamente. Perfecto para el turismo de Barcelona.",
  },
  {
    emoji: "⭐",
    title: "Reputación automática",
    description:
      "Registra no-shows y bloquea clientes problemáticos sin que hagas nada.",
  },
  {
    emoji: "📊",
    title: "Dashboard del barbero",
    description:
      "Panel web para ver reservas del día, marcar no-shows, y ver estadísticas.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* ─── Background Glows ─── */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />

      {/* ─── Nav / Logo ─── */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-6 mx-auto max-w-6xl">
        <a href="/" className="flex items-center gap-3 group">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 transition-colors group-hover:border-emerald-500/50">
            <img src="/logo.svg" alt="Agendalo Icon" className="h-6 w-6 relative z-10" />
            <div className="absolute inset-0 bg-emerald-500/20 blur-md rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">agéndalo</span>
        </a>
        <div className="flex items-center gap-6">
          <a href="#como-funciona" className="hidden sm:block text-sm font-medium text-gray-400 hover:text-white transition-colors">
            Cómo funciona
          </a>
          <a
            href="#precios"
            className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-5 py-2.5 text-sm font-semibold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
          >
            Ver precios
          </a>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-32 pb-24 text-center">
        <div className="relative z-10 mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-400 backdrop-blur-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Tu negocio activo 24/7
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[80px]"
          >
            Mientras tú trabajas, <br className="hidden sm:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
              Agendalo llena tu calendario.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-8 max-w-2xl text-lg text-gray-400 sm:text-xl leading-relaxed"
          >
            El asistente IA para WhatsApp que responde al instante y <span className="text-gray-200 font-medium">sincroniza las reservas con Booksy en piloto automático</span>. No pierdas ni una sola cita.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href="#como-funciona"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-base font-semibold text-white shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all hover:scale-105 hover:bg-emerald-400"
            >
              Descubre cómo funciona
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </motion.div>
        </div>

        {/* Video Player Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          id="video-section"
          className="relative z-10 mt-20 w-full max-w-4xl"
        >
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-b from-emerald-500/20 to-transparent blur-xl opacity-50" />
          <div className="rounded-2xl border border-white/5 bg-[#0A0A0A] p-2 shadow-2xl relative overflow-hidden">
             <VideoSection />
          </div>
        </motion.div>
      </section>

      {/* ─── Problem Section ─── */}
      <section className="relative z-20 border-y border-white/5 bg-[#050505] px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              El problema de las tijeras y el móvil
            </h2>
            <p className="mt-4 text-gray-400 text-lg">No puedes cortar el pelo y chatear al mismo tiempo.</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <ProblemCard
              icon={<ScissorsIcon />}
              title="Mensajes en visto"
              description="Estás atendiendo, un cliente te escribe para reservar, y como tardas en responder, se va a la competencia."
              delay={0.1}
            />
            <ProblemCard
              icon={<ClockIcon />}
              title="Pérdida de ingresos"
              description="Cada chat sin respuesta es dinero tirado a la basura. Hasta 280€ al mes perdidos simplemente por no poder contestar a tiempo."
              delay={0.2}
            />
            <ProblemCard
              icon={<ChartDownIcon />}
              title="Estrés post-cierre"
              description="Llegas a casa cansado y en lugar de descansar, te toca responder decenas de mensajes manualmente para cerrar la agenda."
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* ─── Solution Section ─── */}
      <section id="como-funciona" className="relative z-20 px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-20">
            <span className="text-emerald-500 font-semibold tracking-wider uppercase text-sm">La solución inteligente</span>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Así funciona Agendalo
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 relative">
            {/* Connecting line for desktop */}
            <div className="hidden sm:block absolute top-[44px] left-1/6 right-1/6 h-[2px] bg-gradient-to-r from-emerald-500/0 via-emerald-500/30 to-emerald-500/0 z-0" />

            <StepCard
              step={1}
              title="Conectamos tu Booksy"
              description="Nos conectamos directamente a tu Booksy vía Google Calendar. ¿No sabes cómo hacerlo? Nuestro equipo experto te lo configura todo gratis."
              delay={0.1}
            />
            <StepCard
              step={2}
              title=" WhatsApp responde solo"
              description="Cuando un cliente te escribe, nuestra IA charla, consulta la disponibilidad de tu agenda y le ofrece horas libres instántaneamente."
              delay={0.3}
            />
            <StepCard
              step={3}
              title="Tú solo facturas"
              description="Las reservas aprobadas aparecen como por arte de magia en tu calendario de Booksy. Todo automatizado y sin sorpresas."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section className="relative z-20 border-y border-white/5 bg-[#050505] px-6 py-32">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/5 blur-[140px] rounded-full pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <span className="text-emerald-500 font-semibold tracking-wider uppercase text-sm">
              Qué puede hacer tu bot
            </span>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Todo lo que hace tu bot, sin que muevas un dedo
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Funcionalidades incluidas desde el primer día. Sin configuración extra.
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
                className="border border-white/5 bg-white/[0.02] rounded-2xl p-5 flex items-start gap-4 transition-colors hover:border-emerald-500/20 hover:bg-white/[0.04]"
              >
                <span className="text-2xl shrink-0 mt-0.5" aria-hidden="true">
                  {feature.emoji}
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust Section ─── */}
      <section className="relative overflow-hidden border-b border-white/5 bg-[#030303] px-6 py-24">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[300px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Software de alto nivel, sin fricción
          </h2>
          <p className="mt-4 text-gray-400 text-lg">Integración humana y tecnología punta.</p>

          <div className="mt-12 grid gap-4 text-left sm:grid-cols-2">
            <TrustPoint text="Bilingüe: español e inglés automático" />
            <TrustPoint text="Cancelación en 1 click, sin permanencias" />
            <TrustPoint text="Dashboard web para gestionar tu agenda" />
            <TrustPoint text="En marcha y facturando en menos de 48h" />
          </div>
        </div>
      </section>

      {/* ─── Pricing Section ─── */}
      <section id="precios" className="relative z-20 px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Precios claros y rentables
            </h2>
            <p className="mt-4 text-gray-400">Si salvas a 1 solo cliente, el software se paga solo.</p>
          </div>
          <PricingCards />
        </div>
      </section>

      {/* ─── FAQ Section ─── */}
      <section className="bg-[#050505] px-6 py-24 border-t border-white/5">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Preguntas frecuentes
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="relative px-6 py-32 text-center border-t border-white/5 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-3xl">
          <h2 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            ¿Listo para llenar tu negocio?
          </h2>
          <p className="mt-6 text-xl text-gray-400">
            La competencia ya no deja mensajes sin leer. Súmate hoy.
          </p>
          <div className="mt-12">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-3 rounded-full bg-emerald-500 px-8 py-5 text-lg font-bold text-white shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all hover:scale-105 hover:bg-emerald-400"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 transition-transform group-hover:rotate-12">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Escríbirnos por WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 bg-[#030303] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <a href="/" className="flex items-center gap-3">
                <img src="/logo.svg" alt="Agendalo Icon" className="h-6 w-6" />
                <span className="text-xl font-bold tracking-tight text-white">agéndalo</span>
              </a>
              <p className="mt-4 text-sm leading-relaxed text-gray-500 max-w-xs">
                La solución IA que convierte mensajes de WhatsApp directamente en facturación para tu negocio.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Producto</h4>
              <ul className="mt-4 space-y-3">
                <li><a href="#como-funciona" className="text-sm text-gray-500 hover:text-emerald-400 transition-colors">Cómo funciona</a></li>
                <li><a href="#precios" className="text-sm text-gray-500 hover:text-emerald-400 transition-colors">Precios</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Contacto</h4>
              <ul className="mt-4 space-y-3">
                <li className="text-sm text-gray-500">Barcelona, España</li>
                <li><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-emerald-400 transition-colors">Soporte por WhatsApp</a></li>
                <li><a href="https://aistudios.pro" target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors font-medium">By AI Studios</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
            <p className="text-sm text-gray-600">&copy; {new Date().getFullYear()} Agendalo. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
      <ChatWidget />
    </main>
  );
}

/* ─── Components / Icons ─── */

function ProblemCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay }}
      className="glass-card glass-card-hover p-8 group relative overflow-hidden"
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-500/5 blur-3xl transition-colors group-hover:bg-emerald-500/10" />
      <div className="relative z-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-300 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition-all">
          {icon}
        </div>
        <h3 className="mt-6 text-xl font-bold tracking-tight text-white">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-gray-400">{description}</p>
      </div>
    </motion.div>
  );
}

function StepCard({ step, title, description, delay }: { step: number, title: string, description: string, delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, delay }}
      className="relative z-10 flex flex-col items-center text-center p-6"
    >
      <div className="flex h-20 w-24 items-center justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-emerald-500/20 bg-[#0A0A0A] shadow-[0_0_20px_rgba(16,185,129,0.1)] text-2xl font-bold text-emerald-400 z-10">
          0{step}
        </div>
      </div>
      <h3 className="mt-4 text-xl font-bold tracking-tight text-white">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-gray-400 max-w-sm">{description}</p>
    </motion.div>
  );
}

function TrustPoint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-colors hover:border-emerald-500/20 hover:bg-white/[0.04]">
      <svg className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-gray-300 font-medium">{text}</span>
    </div>
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
