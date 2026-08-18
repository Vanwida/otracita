"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, MotionConfig } from "framer-motion";
import { Wordmark } from "@/components/brand";

/* Constantes de la landing. Cualquier cambio en el número o las URLs vive aquí
 * y se propaga a hero, sección Pruébalo, footer, etc. */
const PHONE_DISPLAY = "711 24 85 00";
const PHONE_TEL = "+34711248500";
const PHONE_WA_URL =
  "https://wa.me/34711248500?text=Hola%2C%20quiero%20probar%20otracita";
const SIGNUP_URL = "/login?signup=1";
const DEMO_URL = "/demo";

const ease = [0.16, 1, 0.3, 1] as const;
const reveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

export default function HomePage() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="font-brand-body antialiased">
        <LandingNav />
        <Hero />
        <PruebaloAhora />
        <LoNuestro />
        <Sustituye />
        <ComoFunciona />
        <VeriFactuSection />
        <CalculadoraPerdidas />
        <Precios />
        <Comparativa />
        <Faq />
        <LandingFooter />
      </main>
    </MotionConfig>
  );
}

/* ─── Nav ────────────────────────────────────────────────
 * Comparte el drench terracota del hero, así nav y hero leen como un solo
 * fold sin costura visible. Mobile colapsa a wordmark + CTA primario. */
function LandingNav() {
  return (
    <header className="drench-cream">
      <nav
        aria-label="Navegación principal"
        className="mx-auto flex max-w-[1480px] items-center justify-between gap-6 px-6 py-5 md:px-10 md:py-6"
      >
        <Link
          href="/"
          aria-label="otracita, inicio"
          className="flex items-center text-[var(--color-ink)]"
        >
          <Wordmark height={28} />
        </Link>
        <div className="flex items-center gap-2 text-[15px] md:gap-7">
          <a
            href="#como-funciona"
            className="hidden text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)] md:inline"
          >
            Cómo funciona
          </a>
          <a
            href="#precios"
            className="hidden text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)] md:inline"
          >
            Precios
          </a>
          <a
            href={SIGNUP_URL}
            className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-brand-strong)]"
          >
            Empieza gratis
          </a>
        </div>
      </nav>
    </header>
  );
}

/* ─── Hero ───────────────────────────────────────────────
 * Drench terracota, h1 Boska a tamaño masivo, una sola idea por viewport.
 * El italic en "marketplace" carga la voz editorial Boska que da voz a la
 * frase, en lugar de un underline o color shift. */
function Hero() {
  return (
    <section
      className="drench-cream relative overflow-hidden"
      aria-labelledby="hero-title"
    >
      <div className="mx-auto max-w-[1480px] px-6 pt-10 pb-20 md:px-10 md:pt-16 md:pb-32">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-14 lg:gap-20">
          <div>
            <motion.p
              initial="hidden"
              animate="visible"
              variants={reveal}
              className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-ink-3)]"
            >
              Disponible en España · VeriFactu listo
            </motion.p>

            <motion.h1
              id="hero-title"
              initial="hidden"
              animate="visible"
              variants={reveal}
              transition={{ duration: 0.7, ease, delay: 0.08 }}
              className="font-brand-display mt-6 max-w-[13ch] text-[clamp(2.6rem,7vw,7.2rem)] font-medium leading-[0.96] text-[var(--color-ink)]"
            >
              <em className="font-medium italic text-[var(--color-brand)]">
                Llegó
              </em>{" "}
              la app del barbero.
            </motion.h1>

            <motion.p
              initial="hidden"
              animate="visible"
              variants={reveal}
              transition={{ duration: 0.7, ease, delay: 0.18 }}
              className="mt-8 max-w-[44ch] text-lg leading-relaxed text-[var(--color-ink-2)] md:text-xl"
            >
              Reservas, caja, factura y fidelidad. Cinco herramientas en
              una sola app. Hecha por barberos.
            </motion.p>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={reveal}
              transition={{ duration: 0.7, ease, delay: 0.28 }}
              className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center"
            >
              <a
                href={SIGNUP_URL}
                className="inline-flex min-h-[56px] items-center justify-center rounded-full bg-[var(--color-brand)] px-8 py-4 text-base font-semibold text-[var(--color-cream-high)] shadow-[0_12px_36px_rgba(201,101,60,0.28)] transition-all hover:bg-[var(--color-brand-strong)] hover:shadow-[0_14px_44px_rgba(201,101,60,0.36)]"
              >
                Empieza gratis
              </a>
              <a
                href="#pruebalo"
                className="inline-flex min-h-[56px] items-center justify-center rounded-full border border-[var(--color-line-strong)] px-7 py-4 text-base font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
              >
                o pruébalo en 30 segundos
                <span aria-hidden="true" className="ml-2">↓</span>
              </a>
            </motion.div>

            <motion.ul
              initial="hidden"
              animate="visible"
              variants={reveal}
              transition={{ duration: 0.7, ease, delay: 0.38 }}
              className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-3)]"
            >
              <li>Sin permanencia</li>
              <li aria-hidden="true">·</li>
              <li>Sin comisión por reserva</li>
              <li aria-hidden="true">·</li>
              <li>Pagas mes a mes</li>
            </motion.ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease, delay: 0.32 }}
            className="relative md:pt-2"
          >
            {/* Glow cálido detrás del agenda. Hace que el ojo aterrice ahí
             * primero antes de descubrir las capas flotantes. Decorativo. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-8 top-12 -z-10 hidden h-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(201,101,60,0.18),rgba(201,101,60,0)_70%)] blur-2xl md:block"
            />

            <AgendaMock />

            {/* Capas de producto flotantes alrededor de la agenda. Comunican
             * "esto hace muchas cosas a la vez" sin meter más copy ni hacer
             * que la agenda crezca. Hidden en mobile (la agenda sola ya pesa).
             * Tilts sutiles (rotate-1, -rotate-1) para depth orgánico. */}
            <motion.div
              initial={{ opacity: 0, y: -16, x: -8 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ duration: 0.9, ease, delay: 0.6 }}
              className="pointer-events-none absolute -top-8 -left-10 z-20 hidden -rotate-2 md:block"
              aria-hidden="true"
            >
              <FloatingChat />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: -10, x: 14 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ duration: 0.9, ease, delay: 0.74 }}
              className="pointer-events-none absolute -top-6 -right-12 z-20 hidden rotate-2 md:block"
              aria-hidden="true"
            >
              <FloatingReview />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16, x: 14 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ duration: 0.9, ease, delay: 0.88 }}
              className="pointer-events-none absolute top-[58%] -right-14 z-20 hidden rotate-1 md:block"
              aria-hidden="true"
            >
              <FloatingPayment />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24, x: -12 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ duration: 0.9, ease, delay: 1.02 }}
              className="pointer-events-none absolute -bottom-10 -left-14 z-20 hidden -rotate-1 md:block"
              aria-hidden="true"
            >
              <FloatingInvoice />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── AgendaMock ────────────────────────────────────────
 * Anclaje visual del hero: una mini agenda del barbero con citas reales,
 * estado "ahora" y caja del día. Sustituye al hueco que dejaba un hero
 * 100% tipográfico. */
function AgendaMock() {
  return (
    <div className="rounded-[28px] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 text-[var(--color-ink)] shadow-[0_40px_100px_rgba(26,18,11,0.16),0_12px_30px_rgba(201,101,60,0.10)] md:p-8">
      {/* App-like header: barra superior con tabs */}
      <div className="flex items-center justify-between border-b border-[var(--color-line)] pb-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-3)]">
            Agenda · Andrés
          </p>
          <p className="font-brand-display mt-1 text-[28px] font-medium leading-none md:text-[32px]">
            Sábado, 20 de abril
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-brand-num text-xs font-semibold text-[var(--color-ink-2)]">
            6 / 9 ocupadas
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-brand-softer)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-strong)]">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
            En curso
          </span>
        </div>
      </div>

      {/* Lista de slots: 8 entradas para densidad real de un día de barbería */}
      <div className="mt-6 space-y-1.5">
        <AgendaSlot time="09:00" name="Marcos R." service="Corte" price="15 €" status="paid" />
        <AgendaSlot time="09:45" name="Iván P." service="Corte + barba" price="25 €" status="paid" />
        <AgendaSlot time="10:30" name="Carlos M." service="Corte" price="15 €" status="paid" />
        <AgendaSlot time="11:15" name="Andreu V." service="Corte + barba" price="25 €" status="next" />
        <AgendaSlot time="12:00" muted />
        <AgendaSlot time="12:45" name="Diego L." service="Corte niño" price="12 €" status="confirmed" />
        <AgendaSlot time="13:30" name="Hassan B." service="Afeitado clásico" price="18 €" status="confirmed" />
        <AgendaSlot time="14:15" muted />
      </div>

      {/* Footer con caja del día y resumen */}
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[var(--color-line)] pt-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
            Caja del día
          </p>
          <p className="font-brand-num mt-1 text-2xl font-semibold text-[var(--color-ink)]">
            110,00 €
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
            Próxima cita
          </p>
          <p className="font-brand-num mt-1 text-2xl font-semibold text-[var(--color-brand-strong)]">
            11:15
          </p>
        </div>
      </div>
    </div>
  );
}

function AgendaSlot({
  time,
  name,
  service,
  price,
  status,
  muted,
}: {
  time: string;
  name?: string;
  service?: string;
  price?: string;
  status?: "paid" | "next" | "confirmed";
  muted?: boolean;
}) {
  if (muted) {
    return (
      <div className="flex items-center justify-between rounded-md px-3 py-2 text-[12px] text-[var(--color-ink-3)]">
        <span className="font-brand-num">{time}</span>
        <span className="italic">Hueco libre</span>
      </div>
    );
  }
  const tone =
    status === "paid"
      ? "bg-[var(--color-brand-softer)]/55"
      : status === "next"
      ? "bg-[var(--color-gold-soft)]/55 ring-1 ring-[var(--color-gold)]/35"
      : "bg-[var(--color-overlay)]";
  return (
    <div
      className={`flex items-baseline justify-between gap-3 rounded-md px-3 py-2.5 text-[13px] ${tone}`}
    >
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="font-brand-num shrink-0 text-[var(--color-ink-2)]">{time}</span>
        <span className="truncate font-medium text-[var(--color-ink)]">{name}</span>
        <span className="hidden truncate text-[var(--color-ink-3)] sm:inline">
          · {service}
        </span>
      </div>
      <span className="font-brand-num shrink-0 font-semibold text-[var(--color-ink)]">
        {price}
      </span>
    </div>
  );
}

/* ─── Capas de producto flotantes (hero) ───────────────
 * Tres mini-piezas de UI que orbitan al AgendaMock para comunicar "esto
 * hace muchas cosas a la vez": un mensaje WhatsApp entrando, un cobro Tap
 * to Pay completándose, una factura VeriFactu firmada. Hidden en mobile,
 * pointer-events disabled (decorativos). */

function FloatingChat() {
  return (
    <div className="w-[244px] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 shadow-[0_24px_60px_rgba(26,18,11,0.18),0_8px_20px_rgba(201,101,60,0.10)]">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-success)]/15">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-[var(--color-success)]">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347" />
          </svg>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          WhatsApp · Carlos
        </span>
        <span className="ml-auto font-brand-num text-[10px] text-[var(--color-ink-3)]">
          08:42
        </span>
      </div>
      <p className="text-[13px] leading-snug text-[var(--color-ink)]">
        Hola, quiero reservar el sábado a las 11.
      </p>
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-overlay)] px-2.5 py-1.5">
        <span className="typing-dot typing-dot-1 inline-block h-1 w-1 rounded-full bg-[var(--color-ink-2)]" />
        <span className="typing-dot typing-dot-2 inline-block h-1 w-1 rounded-full bg-[var(--color-ink-2)]" />
        <span className="typing-dot typing-dot-3 inline-block h-1 w-1 rounded-full bg-[var(--color-ink-2)]" />
        <span className="ml-1 text-[10px] font-medium text-[var(--color-ink-2)]">
          el bot escribe
        </span>
      </div>
    </div>
  );
}

function FloatingReview() {
  return (
    <div className="w-[220px] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 shadow-[0_24px_60px_rgba(26,18,11,0.18),0_8px_20px_rgba(212,165,116,0.14)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          Reseña Google
        </span>
        <span className="font-brand-num text-[10px] text-[var(--color-ink-3)]">
          ahora
        </span>
      </div>
      <div className="mt-2 flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg
            key={i}
            viewBox="0 0 20 20"
            className="h-3.5 w-3.5 fill-[var(--color-gold)]"
          >
            <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77 4.8 17.5l.99-5.78L1.58 7.62l5.82-.85L10 1.5z" />
          </svg>
        ))}
      </div>
      <p className="font-brand-display mt-2 text-[14px] font-medium italic leading-snug text-[var(--color-ink)]">
        “Andrés es un crack. Por fin reservo por WhatsApp.”
      </p>
      <p className="mt-1 text-[10px] text-[var(--color-ink-3)]">Carlos M.</p>
    </div>
  );
}

function FloatingPayment() {
  return (
    <div className="w-[240px] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[0_24px_60px_rgba(26,18,11,0.18),0_8px_20px_rgba(201,101,60,0.10)]">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-brand-softer)]">
          <svg viewBox="0 0 16 16" className="h-3 w-3 fill-[var(--color-brand-strong)]">
            <path d="M2 4h12v2H2zm0 3h12v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7zm2 3v1h3v-1H4z" />
          </svg>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          Tap to Pay
        </span>
        <span className="ml-auto font-brand-num text-[10px] text-[var(--color-ink-3)]">
          ahora
        </span>
      </div>
      <p className="font-brand-num mt-3 text-[26px] font-semibold leading-none text-[var(--color-ink)]">
        + 25,00 €
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-[var(--color-ink-2)]">Carlos M. · 11:23</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-success)]">
          <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
          Cobrado
        </span>
      </div>
    </div>
  );
}

function FloatingInvoice() {
  return (
    <div className="flex w-[240px] items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 shadow-[0_24px_60px_rgba(26,18,11,0.18),0_8px_20px_rgba(201,101,60,0.10)]">
      <div className="grid h-12 w-12 shrink-0 grid-cols-5 gap-px rounded bg-[var(--color-line)] p-0.5">
        {[1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1].map(
          (c, i) => (
            <span
              key={i}
              className={`block aspect-square ${
                c ? "bg-[var(--color-ink)]" : "bg-[var(--color-surface)]"
              }`}
            />
          ),
        )}
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-strong)]">
          Factura 2026-0421
        </p>
        <p className="font-brand-num mt-1 text-[13px] font-semibold text-[var(--color-ink)]">
          Firmada AEAT · 11:24
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">
          Hash 9af2 · 7b14
        </p>
      </div>
    </div>
  );
}

/* ─── Pruébalo en 30 segundos ────────────────────────────
 * Tres portales experienciales. Sin foto, sólo tipo + número de teléfono
 * gigante + CTA. La card 3 (recepcionista IA) lleva un badge "EN PRUEBAS"
 * para no prometer lo que aún no entrega. */
function PruebaloAhora() {
  return (
    <section
      id="pruebalo"
      aria-labelledby="pruebalo-title"
      className="drench-cream"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="flex flex-col gap-3 md:max-w-3xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
            Sin registrarte. Sin demo agendada.
          </span>
          <h2
            id="pruebalo-title"
            className="font-brand-display text-[clamp(2rem,5vw,4rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
          >
            Pruébalo en treinta{" "}
            <em className="italic">segundos</em>.
          </h2>
          <p className="max-w-[55ch] text-base leading-relaxed text-[var(--color-ink-2)] md:text-lg">
            Tres puertas a otracita: una agenda viva donde toquetear, un bot
            real al que escribirle, un teléfono real al que llamar. Tú decides
            por dónde entras.
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          <PruebaloCard
            number="01"
            heading="Entra a una barbería demo"
            description="Una agenda llena de citas reales. Mueve un hueco, cobra un servicio, cierra caja del día. Sin registrarte."
            cta={{ label: "Entrar a la demo", href: DEMO_URL }}
          />
          <PruebaloCard
            number="02"
            heading="Manda un WhatsApp al bot"
            phone={PHONE_DISPLAY}
            description="Escríbele como si fueras un cliente. Te ofrece huecos, confirma la cita, te recuerda el día antes."
            cta={{
              label: "Abrir WhatsApp",
              href: PHONE_WA_URL,
              external: true,
            }}
          />
          <PruebaloCard
            number="03"
            heading="Llama a la recepcionista IA"
            phone={PHONE_DISPLAY}
            description="Pídele cita por teléfono. La IA llega en unas semanas; mientras tanto te coge una persona y te ayuda igual."
            badge="En pruebas"
            cta={{ label: "Llamar ahora", href: `tel:${PHONE_TEL}` }}
          />
        </ul>
      </div>
    </section>
  );
}

function PruebaloCard({
  number,
  heading,
  description,
  phone,
  badge,
  cta,
}: {
  number: string;
  heading: string;
  description: string;
  phone?: string;
  badge?: string;
  cta: { label: string; href: string; external?: boolean };
}) {
  return (
    <motion.li
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={reveal}
      className="group relative flex flex-col rounded-[28px] border border-[var(--color-line)] bg-[var(--color-surface)] p-7 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-brand)] hover:shadow-[0_18px_60px_rgba(201,101,60,0.12)]"
    >
      <div className="flex items-center justify-between">
        <span className="font-brand-num text-sm text-[var(--color-ink-3)]">
          {number}
        </span>
        {badge && (
          <span className="rounded-full bg-[var(--color-gold-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink)]">
            {badge}
          </span>
        )}
      </div>

      <h3 className="font-brand-display mt-8 text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium leading-[1.15] text-[var(--color-ink)]">
        {heading}
      </h3>

      {phone && (
        <p className="font-brand-num mt-4 text-2xl font-semibold text-[var(--color-brand-strong)]">
          +34 {phone}
        </p>
      )}

      <p className="mt-4 flex-1 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
        {description}
      </p>

      <a
        href={cta.href}
        {...(cta.external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        className="mt-7 inline-flex min-h-[48px] items-center justify-between rounded-full bg-[var(--color-ink)] px-5 py-3 text-sm font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-brand)]"
      >
        {cta.label}
        <span aria-hidden="true" className="ml-3">→</span>
      </a>
    </motion.li>
  );
}

/* ─── Lo nuestro ─────────────────────────────────────────
 * Tres principios de identidad positiva. Sustituye al antiguo "El problema"
 * que tenía voz anti-Booksy ("una pataleta") incompatible con la voz brand
 * de PRODUCT.md (audaz, directo, español, premium por contención). El brand
 * se define por lo que es, no por lo que rechaza. */
function LoNuestro() {
  const points = [
    {
      eyebrow: "Atención",
      headline: "Castellano nativo, contestado a mano.",
      detail:
        "Cuando pides ayuda, te contesta una persona en horario laboral, por WhatsApp. Sin tickets ni formularios ni call-center subcontratado.",
    },
    {
      eyebrow: "Tu cliente",
      headline: "Las reservas llegan directas al barbero.",
      detail:
        "Sin intermediarios entre tu cliente y tú. Lo que cobras va directo a tu banco. El cliente que vino una vez, vuelve cuando le toca.",
    },
    {
      eyebrow: "VeriFactu de fábrica",
      headline: "Cumplimiento AEAT en todos los planes.",
      detail:
        "Desde julio de 2027 cada factura llevará QR firmado y hash encadenado AEAT. Ya lo hacemos, también en el plan gratuito. Tu gestor recibe el libro de IVA cada mes.",
    },
  ];

  return (
    <section
      aria-labelledby="principios-title"
      className="drench-cream border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-20">
          <div className="md:sticky md:top-24 md:self-start">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
              Lo nuestro
            </span>
            <h2
              id="principios-title"
              className="font-brand-display mt-3 text-[clamp(2rem,4.6vw,3.6rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
            >
              Tres principios. <em className="italic">Cero excepciones.</em>
            </h2>
          </div>

          <ol className="flex flex-col gap-14">
            {points.map((p, i) => (
              <motion.li
                key={p.headline}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={reveal}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-6 md:gap-10"
              >
                <span
                  aria-hidden="true"
                  className="font-brand-display text-[clamp(3rem,6vw,5rem)] font-medium italic leading-none text-[var(--color-brand)]"
                >
                  0{i + 1}
                </span>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
                    {p.eyebrow}
                  </span>
                  <h3 className="font-brand-display mt-2 text-[clamp(1.4rem,2.4vw,1.85rem)] font-medium leading-[1.2] text-[var(--color-ink)]">
                    {p.headline}
                  </h3>
                  <p className="mt-4 max-w-[50ch] text-[15px] leading-relaxed text-[var(--color-ink-2)] md:text-base">
                    {p.detail}
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─── Sustituye (espresso drench) ────────────────────────
 * "Cinco herramientas → una sola app". Marquee horizontal con las cinco
 * herramientas tachadas, transición a "otracita". Pausable en hover y
 * silenciado en prefers-reduced-motion (ver globals.css). */
function Sustituye() {
  /* Cinco herramientas reales que otracita sustituye. Coincide 1:1 con el
   * h2 ("Cinco herramientas se quedan en una"). La PWA pública (/[slug])
   * es la que reemplaza al perfil de Booksy/Treatwell: el cliente reserva
   * en la web del barbero, no en un marketplace. */
  const tools = [
    "Página de reservas",
    "Agenda multi-barbero",
    "Bot de WhatsApp",
    "Datáfono físico",
    "Facturación legal",
  ];

  return (
    <section
      aria-labelledby="sustituye-title"
      className="drench-espresso relative overflow-hidden"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-28 md:px-10 md:py-40">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-end md:gap-16">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold)]">
              En una sola app
            </span>
            <h2
              id="sustituye-title"
              className="font-brand-display mt-4 text-[clamp(2.4rem,6vw,5.6rem)] font-medium leading-[0.98] text-[var(--color-cream-high)]"
            >
              Cinco herramientas,{" "}
              <em className="italic text-[var(--color-gold)]">una agenda</em>.
            </h2>
          </div>
          <p className="max-w-[42ch] text-base leading-relaxed text-[var(--color-cream-on-dark)] md:text-lg">
            Reservas, agenda, cobro, factura y fidelidad. Una sola app. Tu
            gestor recibe el libro de IVA cada mes, listo para el Modelo 303.
          </p>
        </div>
      </div>

      {/* Marquee. Doble lista para loop sin costura. */}
      <div
        className="relative flex overflow-hidden border-y divider-on-dark py-6 md:py-9"
        aria-hidden="true"
      >
        <div className="flex w-max shrink-0 animate-marquee gap-12 pr-12 md:gap-20 md:pr-20">
          <MarqueeRow tools={tools} />
          <MarqueeRow tools={tools} />
        </div>
      </div>

      <div className="mx-auto max-w-[1480px] px-6 pt-16 pb-28 md:px-10 md:pt-20 md:pb-40">
        <div className="grid gap-10 md:grid-cols-3">
          <SustituyeStat
            label="Cuota fija al mes"
            value="49 €"
            note="Una sola cuota, todas las herramientas. Sin permanencia."
          />
          <SustituyeStat
            label="Apps en tu móvil"
            value="1"
            note="La que abre el día y la que cierra caja."
          />
          <SustituyeStat
            label="Comisión por reserva"
            value="0 %"
            note="Tu cliente reserva, tú cobras todo. El dinero va directo a tu banco."
          />
        </div>
      </div>
    </section>
  );
}

function MarqueeRow({ tools }: { tools: string[] }) {
  return (
    <ul className="flex shrink-0 items-center gap-12 md:gap-20">
      {tools.map((t) => (
        <li
          key={t}
          className="font-brand-display text-2xl font-medium leading-none text-[var(--color-cream-on-dark)] md:text-4xl"
        >
          <span className="line-through decoration-[var(--color-brand)] decoration-2 underline-offset-[0.2em]">
            {t}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SustituyeStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="border-t divider-on-dark pt-6">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold)]">
        {label}
      </span>
      <p className="font-brand-display mt-3 text-[clamp(2.4rem,4.4vw,3.6rem)] font-medium leading-none text-[var(--color-cream-high)]">
        {value}
      </p>
      <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-[var(--color-cream-on-dark)]/80">
        {note}
      </p>
    </div>
  );
}

/* ─── Cómo funciona en tu día ────────────────────────────
 * Storytelling vertical, cinco escenas con un mock SVG-CSS por step en
 * lugar de fotografía. Los mocks usan la misma paleta del producto para
 * que la coherencia sea total. */
function ComoFunciona() {
  const steps = [
    {
      n: "01",
      hour: "08:42",
      title: "Carlos te escribe por WhatsApp",
      detail:
        "El bot ofrece huecos reales, confirma la cita y la mete en tu agenda. Tú no tocas el móvil.",
      mock: <ChatMock />,
    },
    {
      n: "02",
      hour: "El día antes",
      title: "Le llega un recordatorio amable",
      detail:
        "Si está instalada la app del barbero, suena push. Si no, WhatsApp. Nunca las dos a la vez.",
      mock: <NotificationMock />,
    },
    {
      n: "03",
      hour: "11:23",
      title: "Cobras desde el iPhone",
      detail:
        "Tap to Pay con SumUp. Sin TPV físico, sin lector. La tarjeta del cliente se acerca al iPhone.",
      mock: <TapMock />,
    },
    {
      n: "04",
      hour: "11:24",
      title: "La factura VeriFactu sale sola",
      detail:
        "QR firmado, hash encadenado, datos AEAT. PDF al cliente, libro al gestor. Tú no firmas nada.",
      mock: <FacturaMock />,
    },
    {
      n: "05",
      hour: "Por la tarde",
      title: "Carlos te deja propina y reseña en Google",
      detail:
        "Un enlace, dos toques. La propina va directa al barbero que le cortó. La reseña sube tu Google.",
      mock: <ReviewMock />,
    },
  ];

  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-title"
      className="drench-cream border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="md:max-w-3xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
            Un día cualquiera
          </span>
          <h2
            id="como-funciona-title"
            className="font-brand-display mt-3 text-[clamp(2rem,5vw,4rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
          >
            Lo que pasa <em className="italic">solo</em>, mientras cortas.
          </h2>
        </div>

        <ol className="mt-16 flex flex-col gap-20 md:gap-24">
          {steps.map((s, i) => (
            <motion.li
              key={s.n}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={reveal}
              className={`grid items-center gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-16 lg:gap-20 ${
                i % 2 === 1 ? "md:[&>div:first-child]:order-2" : ""
              }`}
            >
              <div>
                <div className="flex items-baseline gap-4">
                  <span className="font-brand-num text-sm text-[var(--color-ink-3)]">
                    {s.n}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-2)]">
                    {s.hour}
                  </span>
                </div>
                <h3 className="font-brand-display mt-3 text-[clamp(1.7rem,3.2vw,2.6rem)] font-medium leading-[1.1] text-[var(--color-ink)]">
                  {s.title}
                </h3>
                <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-[var(--color-ink-2)] md:text-base">
                  {s.detail}
                </p>
              </div>
              <div className="mx-auto w-full max-w-[340px] md:max-w-[380px]">
                {s.mock}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── VeriFactu ──────────────────────────────────────────
 * Tono tranquilizador, no alarmista. El brief quería sección dedicada con
 * mock de factura PDF. */
function VeriFactuSection() {
  return (
    <section
      aria-labelledby="verifactu-title"
      className="drench-overlay border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center md:gap-20">
          <div className="order-2 md:order-1">
            <FacturaMock big />
          </div>
          <div className="order-1 md:order-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
              Cumplimiento legal
            </span>
            <h2
              id="verifactu-title"
              className="font-brand-display mt-3 text-[clamp(2rem,4.8vw,3.8rem)] font-medium leading-[1.04] text-[var(--color-ink)]"
            >
              VeriFactu llega en julio de 2027.{" "}
              <em className="italic">Ya está resuelto.</em>
            </h2>
            <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-[var(--color-ink-2)] md:text-lg">
              Cada factura sale con QR firmado, hash encadenado y los datos
              que pide la AEAT. Tu libro de IVA se exporta cada mes a Excel
              listo para tu gestor. Tú solo cobras.
            </p>
            <ul className="mt-8 space-y-3 text-[15px] leading-relaxed text-[var(--color-ink-2)]">
              <FactCheck>QR y hash AEAT en cada PDF</FactCheck>
              <FactCheck>Declaración Responsable firmada</FactCheck>
              <FactCheck>Libro de Facturas Emitidas, Modelo 303</FactCheck>
              <FactCheck>Incluido también en el plan gratuito</FactCheck>
            </ul>
            <Link
              href="/legal/verifactu"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-strong)] underline decoration-[var(--color-brand)]/40 underline-offset-4 transition-colors hover:text-[var(--color-brand)]"
            >
              Leer la Declaración Responsable
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FactCheck({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-softer)] text-[var(--color-brand-strong)]"
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path
            d="M2 6.5l2.5 2.5L10 3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {children}
    </li>
  );
}

/* ─── Calculadora de pérdidas por llamadas no atendidas ──
 * Sección que ancla VALOR antes de mostrar PRECIO. Slider interactivo:
 * el barbero ajusta cuántas llamadas pierde/día, ve el cálculo en €
 * mensual y anual. Datos basados en estadísticas reales de SMB
 * (Nextiva: 62% llamadas perdidas, 85% no reintenta) y LTV típico
 * barbería España (12 visitas/año × €25 = €300/cliente año 1).
 *
 * Es deliberadamente confrontativo pero no whining: el barbero llega
 * aquí, ajusta el slider a "5 llamadas/día" (lo que dijo Reni), y ve
 * "estás perdiendo €3.900 al año". El precio Estudio (€149/mes) que
 * viene justo después se siente barato por contraste. */
function CalculadoraPerdidas() {
  const [llamadasDia, setLlamadasDia] = useState(5);

  // Constantes derivadas de research verificado:
  //   - 22 días laborales/mes
  //   - 17% de las llamadas perdidas son intentos de reserva NUEVA
  //   - 85% de quienes no consiguen contactar NO vuelven a intentar
  //   - €300 LTV año 1 (12 visitas × €25 ticket medio barbería premium)
  const diasLaborales = 22;
  const pctReservaNueva = 0.17;
  const pctNoReintenta = 0.85;
  const ltvAnual = 300;

  const perdidasMes = llamadasDia * diasLaborales;
  const reservasNuevasPerdidas = Math.round(perdidasMes * pctReservaNueva);
  const clientesPerdidos = Math.round(reservasNuevasPerdidas * pctNoReintenta);
  const revenueAnualPerdido = clientesPerdidos * 12 * ltvAnual;
  const revenueMensualPerdido = Math.round(revenueAnualPerdido / 12);

  // Precio Estudio sincronizado con TIER_PRICES en src/lib/billing/tier.ts
  const costeAnualEstudio = 169 * 12;
  // Nota: si el barbero coge anual, son €1.428/año en lugar de €2.028. La
  // calculadora usa el mensual para ser conservadora con el ahorro mostrado.
  const beneficioNetoAnual = revenueAnualPerdido - costeAnualEstudio;

  return (
    <section
      aria-labelledby="calc-title"
      className="drench-cream border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-20">
          {/* Texto + slider */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
              La pérdida invisible
            </span>
            <h2
              id="calc-title"
              className="font-brand-display mt-3 text-[clamp(2rem,4.6vw,3.6rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
            >
              <em className="italic">¿Cuántas llamadas</em> pierdes al día?
            </h2>
            <p className="mt-5 max-w-[50ch] text-base leading-relaxed text-[var(--color-ink-2)] md:text-lg">
              La media de pequeño negocio pierde el 62% de sus llamadas. El 85% de los que no contestan, no vuelven a intentarlo. Para una barbería, cada llamada perdida puede ser un cliente que se va a la de al lado para siempre.
            </p>

            <div className="mt-10">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="calc-slider"
                  className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-2)]"
                >
                  Llamadas que pierdes al día
                </label>
                <span className="font-brand-display text-2xl font-medium text-[var(--color-brand-strong)]">
                  {llamadasDia}
                </span>
              </div>
              <input
                id="calc-slider"
                type="range"
                min={1}
                max={15}
                step={1}
                value={llamadasDia}
                onChange={(e) => setLlamadasDia(Number(e.target.value))}
                aria-valuetext={`${llamadasDia} llamadas perdidas al día`}
                className="mt-3 w-full accent-[var(--color-brand)]"
                style={{ minHeight: 32 }}
              />
              <div className="mt-1 flex justify-between font-brand-num text-[11px] text-[var(--color-ink-3)]">
                <span>1</span>
                <span>5 (caso típico)</span>
                <span>15</span>
              </div>
            </div>
          </div>

          {/* Resultado: el número grande */}
          <div className="rounded-[28px] border border-[var(--color-line)] bg-[var(--color-surface)] p-7 shadow-[0_28px_70px_rgba(26,18,11,0.12)] md:p-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
              Estás dejando ir
            </p>
            <p className="font-brand-display mt-3 text-[clamp(3rem,7vw,5.5rem)] font-medium leading-none text-[var(--color-brand)]">
              {revenueMensualPerdido.toLocaleString("es-ES")} €
            </p>
            <p className="mt-2 text-base text-[var(--color-ink-2)]">
              al mes. Eso son{" "}
              <strong className="font-brand-num font-semibold text-[var(--color-ink)]">
                {revenueAnualPerdido.toLocaleString("es-ES")} €
              </strong>{" "}
              al año en clientes nuevos que se van a otra barbería.
            </p>

            <div className="mt-8 rounded-2xl bg-[var(--color-overlay)] p-5">
              <p className="text-sm leading-relaxed text-[var(--color-ink-2)]">
                La recepcionista IA de{" "}
                <strong className="font-semibold text-[var(--color-ink)]">
                  otracita Estudio
                </strong>{" "}
                está para contestar el 100% de las llamadas, 24/7. Costará{" "}
                <span className="font-brand-num font-semibold text-[var(--color-ink)]">
                  {costeAnualEstudio.toLocaleString("es-ES")} €
                </span>{" "}
                al año.
              </p>
              <p className="mt-2 text-xs text-[var(--color-ink-3)]">
                Todavía no coge llamadas: está en pruebas. Hasta que abra, esa
                cuenta es lo que te vas a ahorrar, no lo que te ahorras hoy.
              </p>
              {beneficioNetoAnual > 0 ? (
                <p className="font-brand-num mt-3 text-sm font-semibold text-[var(--color-success)]">
                  Beneficio neto: +{beneficioNetoAnual.toLocaleString("es-ES")} €/año
                </p>
              ) : (
                <p className="mt-3 text-sm text-[var(--color-ink-2)]">
                  Para tu volumen, Pro a 49 €/mes te encaja mejor.
                </p>
              )}
              <p className="mt-3 text-xs text-[var(--color-ink-3)]">
                Empieza con <strong className="font-semibold text-[var(--color-ink-2)]">Pro 14 días gratis</strong>. Lo que ya funciona hoy — agenda, app y facturación — no depende de la voz.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 text-xs text-[var(--color-ink-3)]">
              <div>
                <p className="font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
                  Cálculo
                </p>
                <p className="mt-1 leading-relaxed">
                  {clientesPerdidos} clientes nuevos perdidos/mes × €300 LTV año 1
                </p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
                  Fuentes
                </p>
                <p className="mt-1 leading-relaxed">
                  62% llamadas perdidas (Nextiva), 85% no reintenta (sector)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Precios ────────────────────────────────────────────
 * Tres tiers genuinamente diferentes en color, peso y altura. Sin "Most
 * Popular" badge. Pro destaca por fondo brand-softer; Estudio por drench
 * espresso interno; Solo es la card más serena. */
function Precios() {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");

  return (
    <section
      id="precios"
      aria-labelledby="precios-title"
      className="drench-cream border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="md:max-w-3xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
            Precios honestos
          </span>
          <h2
            id="precios-title"
            className="font-brand-display mt-3 text-[clamp(2rem,5vw,4rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
          >
            Tres planes. Sin{" "}
            <em className="italic">comisiones</em> por reserva.
          </h2>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[var(--color-ink-2)] md:text-lg">
            SumUp y Stripe procesan los cobros directos al barbero. otracita
            cobra una cuota mensual o anual y nada más. Sin permanencia en Solo y Pro.
          </p>
        </div>

        {/* Toggle Mensual / Anual. El "anual" se cobra una sola vez al inicio
         * del periodo en Stripe; el precio mostrado es el equivalente por mes
         * para que la comparación sea inmediata. */}
        <div className="mt-10 inline-flex items-center gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-1">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            aria-pressed={interval === "monthly"}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              interval === "monthly"
                ? "bg-[var(--color-ink)] text-[var(--color-cream-high)]"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            aria-pressed={interval === "annual"}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              interval === "annual"
                ? "bg-[var(--color-ink)] text-[var(--color-cream-high)]"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            }`}
          >
            Anual
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                interval === "annual"
                  ? "bg-[var(--color-gold)] text-[var(--color-espresso)]"
                  : "bg-[var(--color-brand-softer)] text-[var(--color-brand-strong)]"
              }`}
            >
              ahorra hasta 30%
            </span>
          </button>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          <PriceCard
            tone="solo"
            tier="Solo"
            tagline="Para barbero individual"
            priceMonthly="Gratis"
            priceAnnual="Gratis"
            interval={interval}
            secondary="0 € siempre, sin tarjeta"
            cta={{ label: "Empezar gratis", href: SIGNUP_URL }}
            features={[
              "Agenda multi-día",
              "Caja del día con cuadre",
              "PWA pública en /tu-barbería",
              "VeriFactu AEAT incluido",
              "Cobro online por QR (Stripe)",
            ]}
          />
          <PriceCard
            tone="pro"
            tier="Pro"
            tagline="Para barbería 2 a 5 sillones"
            priceMonthly="49 €"
            priceAnnual="39 €"
            interval={interval}
            secondary={
              interval === "annual"
                ? "468 € al año (un solo cobro)"
                : "facturado mensual"
            }
            highlight="14 días gratis · no cobramos hasta el día 15"
            cta={{ label: "Empezar 14 días gratis", checkoutTier: "pro" }}
            checkoutInterval={interval}
            features={[
              "Todo lo de Solo",
              "Bot de WhatsApp 24/7",
              "Multi-barbero ilimitado",
              "SumUp Tap to Pay (iPhone)",
              "Fidelidad por sellos o puntos",
              "Promos contextuales a clientes habituales",
            ]}
          />
          <PriceCard
            tone="estudio"
            tier="Estudio"
            tagline="Para barbería con marca propia"
            priceMonthly="169 €"
            priceAnnual="119 €"
            interval={interval}
            secondary={
              interval === "annual"
                ? "1.428 € al año (un solo cobro · ahorras 600 €). Incluirá 200 llamadas/mes con la recepcionista IA, después 0,30 € cada una."
                : "Incluirá 200 llamadas/mes con la recepcionista IA, después 0,30 € cada una."
            }
            cta={{ label: "Empezar Estudio", checkoutTier: "estudio" }}
            checkoutInterval={interval}
            features={[
              "Todo lo de Pro",
              "Recepcionista de IA por teléfono (200 llamadas/mes) — en pruebas, aún no coge llamadas",
              "Subdominio propio (reservas.tubarberia.com)",
              "Onboarding 1:1 con migración asistida",
              "Soporte prioritario por WhatsApp",
            ]}
          />
        </div>

        <p className="mt-10 max-w-2xl text-sm text-[var(--color-ink-2)]">
          Todos los planes incluyen actualizaciones, cumplimiento VeriFactu y
          alojamiento en la UE. Sin comisión por transacción. Sin permanencia
          en Solo y Pro.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-ink-3)]">
          ¿Tienes más de un local? Cada local lleva su propia cuenta otracita.{" "}
          <a
            href={PHONE_WA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--color-brand-strong)] underline decoration-[var(--color-brand)]/40 underline-offset-4 hover:text-[var(--color-brand)]"
          >
            Hablamos antes de empezar
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function PriceCard({
  tone,
  tier,
  tagline,
  priceMonthly,
  priceAnnual,
  interval,
  secondary,
  features,
  cta,
  checkoutInterval,
  highlight,
}: {
  tone: "solo" | "pro" | "estudio";
  tier: string;
  tagline: string;
  priceMonthly: string;
  priceAnnual: string;
  interval: "monthly" | "annual";
  secondary?: string;
  features: string[];
  // cta es: o un href directo (Solo → /login), o un checkoutTier que dispara
  // POST /api/checkout y redirige a Stripe (Pro/Estudio).
  cta:
    | { label: string; href: string; external?: boolean; checkoutTier?: never }
    | { label: string; checkoutTier: "pro" | "estudio"; href?: never; external?: never };
  checkoutInterval?: "monthly" | "annual";
  highlight?: string;
}) {
  const styles = {
    solo: {
      wrapper:
        "bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)]",
      tier: "text-[var(--color-ink)]",
      price: "text-[var(--color-ink)]",
      tagline: "text-[var(--color-ink-2)]",
      annual: "text-[var(--color-ink-3)]",
      feature: "text-[var(--color-ink-2)]",
      bullet: "text-[var(--color-brand)]",
      cta: "bg-[var(--color-ink)] text-[var(--color-cream-high)] hover:bg-[var(--color-brand)]",
    },
    pro: {
      wrapper:
        "bg-[var(--color-brand-softer)] border-2 border-[var(--color-brand)] text-[var(--color-ink)] shadow-[0_24px_60px_rgba(201,101,60,0.18)] md:scale-[1.04] md:-mt-4 md:mb-4",
      tier: "text-[var(--color-brand-strong)]",
      price: "text-[var(--color-brand-strong)]",
      tagline: "text-[var(--color-ink-2)]",
      annual: "text-[var(--color-ink-2)]",
      feature: "text-[var(--color-ink)]",
      bullet: "text-[var(--color-brand-strong)]",
      cta: "bg-[var(--color-brand)] text-[var(--color-cream-high)] hover:bg-[var(--color-brand-strong)] shadow-[0_8px_24px_rgba(201,101,60,0.28)]",
    },
    estudio: {
      wrapper:
        "bg-[var(--color-espresso)] border border-[var(--color-espresso-2)] text-[var(--color-cream-high)]",
      tier: "text-[var(--color-gold)]",
      price: "text-[var(--color-cream-high)]",
      tagline: "text-[var(--color-cream-on-dark)]/80",
      annual: "text-[var(--color-cream-on-dark)]/60",
      feature: "text-[var(--color-cream-on-dark)]",
      bullet: "text-[var(--color-gold)]",
      cta: "bg-[var(--color-gold)] text-[var(--color-espresso)] hover:bg-[var(--color-cream-on-dark)]",
    },
  }[tone];

  return (
    <article
      className={`relative flex flex-col rounded-[28px] p-7 md:p-8 transition-all ${styles.wrapper}`}
    >
      {tone === "pro" && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--color-brand)] px-4 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-cream-high)] shadow-[0_6px_18px_rgba(201,101,60,0.32)]">
          Recomendado
        </span>
      )}
      <header>
        <h3
          className={`font-brand-display text-[clamp(1.6rem,2.4vw,2rem)] font-medium leading-tight ${styles.tier}`}
        >
          {tier}
        </h3>
        <p className={`mt-1 text-sm ${styles.tagline}`}>{tagline}</p>
      </header>

      <div className="mt-8">
        <div className="flex items-baseline gap-2">
          <p className={`font-brand-display text-[clamp(2.4rem,5vw,3.4rem)] font-medium leading-none ${styles.price}`}>
            {interval === "annual" ? priceAnnual : priceMonthly}
          </p>
          {priceMonthly !== "Gratis" && (
            <span className={`text-sm font-medium ${styles.tagline}`}>
              /mes
            </span>
          )}
        </div>
        {secondary && (
          <p className={`mt-2 text-sm ${styles.annual}`}>{secondary}</p>
        )}
        {highlight && (
          <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            tone === "estudio"
              ? "bg-[var(--color-gold)]/15 text-[var(--color-gold)]"
              : "bg-[var(--color-brand)]/12 text-[var(--color-brand-strong)]"
          }`}>
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
            {highlight}
          </p>
        )}
      </div>

      <ul className={`mt-8 flex-1 space-y-3 text-[15px] leading-relaxed ${styles.feature}`}>
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span aria-hidden="true" className={`mt-2 inline-block h-1 w-3 shrink-0 rounded-full ${styles.bullet} bg-current`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {cta.checkoutTier ? (
        <CheckoutButton
          tier={cta.checkoutTier}
          interval={checkoutInterval ?? "monthly"}
          label={cta.label}
          className={`mt-10 inline-flex min-h-[52px] items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold transition-colors disabled:opacity-60 ${styles.cta}`}
        />
      ) : (
        <a
          href={cta.href}
          {...(cta.external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
          className={`mt-10 inline-flex min-h-[52px] items-center justify-center rounded-full px-6 py-3.5 text-sm font-semibold transition-colors ${styles.cta}`}
        >
          {cta.label}
        </a>
      )}
    </article>
  );
}

/* CTA que dispara checkout Stripe. Pro lleva trial 14d (configurado en
 * /api/checkout). Estudio va directo sin trial. Si Stripe falla, mostramos
 * el error inline y permitimos reintentar. */
function CheckoutButton({
  tier,
  interval,
  label,
  className,
}: {
  tier: "pro" | "estudio";
  interval: "monthly" | "annual";
  label: string;
  className: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, billingInterval: interval }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "No se pudo iniciar el checkout");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setLoading(false);
    }
  }

  return (
    <div className="mt-10 flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className.replace("mt-10 ", "")}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
              <path
                fill="currentColor"
                className="opacity-75"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Redirigiendo a Stripe…
          </span>
        ) : (
          label
        )}
      </button>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/* ─── Comparativa de stack ───────────────────────────────
 * "Lo que pagarías sin nosotros". Suma de herramientas separadas vs
 * otracita. Datos verificados con research (mediana de mercado). NO
 * nombramos competidores por su nombre porque el barbero ya lo está
 * pagando y se reconoce sin que se lo digamos. Más elegante. Si el
 * barbero quiere los nombres, los lee en el FAQ. */
function Comparativa() {
  const stackItems = [
    { label: "Página de reservas + agenda", price: 45 },
    { label: "Software de facturación", price: 40 },
    { label: "Bot de WhatsApp con IA", price: 30 },
    { label: "Programa de fidelidad", price: 15 },
  ];
  const stackTotal = stackItems.reduce((acc, x) => acc + x.price, 0);
  const proPrice = 49;
  const ahorroPro = stackTotal - proPrice;
  const ahorroAnual = ahorroPro * 12;

  return (
    <section
      aria-labelledby="comparativa-title"
      className="drench-overlay border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[1480px] px-6 py-24 md:px-10 md:py-32">
        <div className="md:max-w-3xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
            Lo que te ahorras
          </span>
          <h2
            id="comparativa-title"
            className="font-brand-display mt-3 text-[clamp(2rem,4.6vw,3.6rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
          >
            Hoy pagas a cuatro sitios.{" "}
            <em className="italic">Mañana, a uno.</em>
          </h2>
          <p className="mt-5 max-w-[55ch] text-base leading-relaxed text-[var(--color-ink-2)] md:text-lg">
            Lo que típicamente paga una barbería con la herramienta que conoces para reservas, otra para facturación, otra para el bot, otra para fidelidad. Suma esto.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-10">
          {/* Stack actual */}
          <article className="rounded-[24px] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 md:p-8">
            <header className="mb-5 border-b border-[var(--color-line)] pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
                Stack típico
              </p>
              <p className="font-brand-display mt-1 text-xl font-medium text-[var(--color-ink)]">
                Cuatro suscripciones distintas
              </p>
            </header>
            <ul className="space-y-3 text-[15px]">
              {stackItems.map((item) => (
                <li
                  key={item.label}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-[var(--color-ink-2)]">
                    {item.label}
                  </span>
                  <span className="font-brand-num shrink-0 text-[var(--color-ink)]">
                    {item.price} €/mes
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-baseline justify-between border-t border-[var(--color-line)] pt-4">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
                Total
              </span>
              <span className="font-brand-display text-[clamp(1.6rem,2.4vw,2rem)] font-medium text-[var(--color-ink)]">
                {stackTotal} €/mes
              </span>
            </div>
          </article>

          {/* Flecha / arrow visual */}
          <div className="hidden md:flex items-center justify-center" aria-hidden="true">
            <span className="font-brand-display text-3xl text-[var(--color-brand-strong)]">→</span>
          </div>
          <div className="md:hidden flex items-center justify-center text-[var(--color-brand-strong)]" aria-hidden="true">
            <span className="font-brand-display text-2xl">↓</span>
          </div>

          {/* otracita */}
          <article className="rounded-[24px] border-2 border-[var(--color-brand)] bg-[var(--color-brand-softer)] p-6 shadow-[0_24px_60px_rgba(201,101,60,0.18)] md:p-8">
            <header className="mb-5 border-b border-[var(--color-brand)]/20 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-brand-strong)]">
                otracita Pro
              </p>
              <p className="font-brand-display mt-1 text-xl font-medium text-[var(--color-ink)]">
                Una sola app, todo dentro
              </p>
            </header>
            <ul className="space-y-3 text-[15px] text-[var(--color-ink)]">
              <li className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-brand-strong)]">·</span>
                Página de reservas + agenda multi-barbero
              </li>
              <li className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-brand-strong)]">·</span>
                Facturación VeriFactu legal
              </li>
              <li className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-brand-strong)]">·</span>
                Bot WhatsApp 24/7
              </li>
              <li className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-brand-strong)]">·</span>
                Fidelidad por sellos o puntos
              </li>
              <li className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-brand-strong)]">·</span>
                SumUp Tap to Pay incluido
              </li>
            </ul>
            <div className="mt-5 flex items-baseline justify-between border-t border-[var(--color-brand)]/20 pt-4">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-strong)]">
                Total
              </span>
              <span className="font-brand-display text-[clamp(1.6rem,2.4vw,2rem)] font-medium text-[var(--color-brand-strong)]">
                {proPrice} €/mes
              </span>
            </div>
          </article>
        </div>

        {/* Banner inferior con el ahorro */}
        <div className="mt-10 rounded-[24px] bg-[var(--color-espresso)] p-6 text-center md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-gold)]">
            Te ahorras al mes
          </p>
          <p className="font-brand-display mt-3 text-[clamp(2.4rem,5vw,3.6rem)] font-medium leading-none text-[var(--color-cream-high)]">
            {ahorroPro} €
          </p>
          <p className="mt-3 text-base text-[var(--color-cream-on-dark)]">
            Eso son{" "}
            <strong className="font-brand-num font-semibold text-[var(--color-gold)]">
              {ahorroAnual.toLocaleString("es-ES")} €
            </strong>{" "}
            al año, sin contar el tiempo que ganas al tener todo en un sitio.
          </p>
        </div>

        <p className="mt-8 max-w-3xl text-sm text-[var(--color-ink-3)]">
          Cifras basadas en mediana de mercado: agenda + staff extra (€45),
          software facturación SMB (€40), chatbot WhatsApp con IA (€30),
          plataforma de fidelidad (€15). Si además quieres recepcionista IA por
          teléfono, suma €150-200/mes a ese stack — la nuestra irá dentro de
          otracita Estudio (169 €/mes, o 119 €/mes en anual) y sigue en pruebas.
        </p>
      </div>
    </section>
  );
}

/* ─── FAQ ────────────────────────────────────────────────
 * <details> nativos. Funciona sin JS, animación de chevron por CSS,
 * tap target ≥48px en summary. */
function Faq() {
  const items = [
    {
      q: "¿Cómo migro mis citas desde mi marketplace actual?",
      a: "Te las exportamos a CSV, las importamos a otracita y avisamos a tus clientes del cambio. Tarda entre 24 y 48 horas. Lo hacemos nosotros, tú no tocas nada.",
    },
    {
      q: "¿Qué pasa con mis clientes actuales?",
      a: "Siguen siendo tuyos. Migran contigo, conservan su historial y, cuando reservan por WhatsApp, te llega directamente. Cero intermediarios.",
    },
    {
      q: "¿Necesito comprar un TPV nuevo?",
      a: "No. Cobras desde tu propio iPhone con SumUp Tap to Pay; el cliente acerca la tarjeta al móvil. Si ya tienes un datáfono que te gusta, lo sigues usando.",
    },
    {
      q: "¿Y si se cae internet en la barbería?",
      a: "La agenda funciona offline en modo lectura: ves todas tus citas. Cobros y bot necesitan conexión; en cuanto vuelve, todo se sincroniza solo.",
    },
    {
      q: "¿Quién tiene acceso a mis datos?",
      a: "Solo tú. Datos cifrados en reposo y en tránsito, alojamiento en la UE, conformidad GDPR. Si te das de baja, los exportas y se borran a los 30 días.",
    },
    {
      q: "¿Puedo darme de baja sin penalización?",
      a: "Sí. Pro arranca con 14 días gratis: pides la tarjeta para activar, pero no se cobra hasta el día 15. Cancelas dentro de los 14 días y no pagas nada. Después, sin permanencia: te vas cuando quieras. Solo es gratis siempre. Estudio incluye onboarding 1:1 con compromiso mínimo de 6 meses.",
    },
    {
      q: "¿Cómo es el flujo natural? ¿Por dónde empiezo?",
      a: "Empiezas en Solo (gratis, sin tarjeta) para ver la app por dentro. Cuando le veas el sitio, pasas a Pro 14 días gratis y activas el bot de WhatsApp y SumUp. Cuando ya estás cómodo en Pro y quieres dejar de coger el teléfono, te toca Estudio — la recepcionista IA sigue en pruebas y te avisamos en cuanto empiece a coger llamadas. Cero presión, cero saltos: cada paso encaja con lo que necesites en ese momento.",
    },
    {
      q: "¿Soporta otracita varias barberías o más de un local?",
      a: "Sí. Cada local lleva su propia cuenta otracita: cada uno con su agenda, su PWA pública, sus barberos y su factura. Si gestionas 2 locales con Pro, son 2 × 49€/mes (o 2 × 39€/mes anual). Lo planteamos así para que cada local mantenga su identidad propia. Cuando captemos varios clientes con multi-local que pidan dashboard agregado, lo construiremos. Si tienes 2+ locales y prefieres hablar antes de signup, escríbenos al WhatsApp del equipo.",
    },
    {
      q: "¿Funciona si soy autónomo solo, sin empleados?",
      a: "Sí. Solo (gratis) está hecho para exactamente ese caso: agenda + caja + PWA pública + factura VeriFactu + cobro online. Sin tarjeta, sin trial.",
    },
    {
      q: "¿VeriFactu va incluido también en el plan gratuito?",
      a: "Sí. La obligación legal AEAT (julio 2027) está cubierta en todos los planes, también en Solo. Es nuestra responsabilidad técnica, no tuya.",
    },
  ];

  return (
    <section
      aria-labelledby="faq-title"
      className="drench-overlay border-t border-[var(--color-line)]"
    >
      <div className="mx-auto max-w-[960px] px-6 py-24 md:px-10 md:py-32">
        <div className="md:max-w-2xl">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand-strong)]">
            Preguntas frecuentes
          </span>
          <h2
            id="faq-title"
            className="font-brand-display mt-3 text-[clamp(2rem,4.6vw,3.4rem)] font-medium leading-[1.05] text-[var(--color-ink)]"
          >
            Lo que la gente nos pregunta antes de empezar.
          </h2>
        </div>

        <div className="mt-12 border-t border-[var(--color-line-strong)]/50">
          {items.map((item) => (
            <details
              key={item.q}
              className="group border-b border-[var(--color-line-strong)]/50 py-6"
            >
              <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium text-[var(--color-ink)] md:text-lg">
                {item.q}
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink-2)] transition-transform duration-300 group-open:rotate-45 group-open:border-[var(--color-brand)] group-open:text-[var(--color-brand)]"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                    <path
                      d="M6 1v10M1 6h10"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <div className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-[var(--color-ink-2)] md:text-base">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────
 * Drench espresso. Wordmark cream override, links legales discretos,
 * "Hecho en España" como único copy editorial. */
function LandingFooter() {
  return (
    <footer
      aria-labelledby="footer-heading"
      className="drench-espresso"
    >
      <h2 id="footer-heading" className="sr-only">
        Pie de página
      </h2>
      <div className="mx-auto max-w-[1480px] px-6 py-20 md:px-10 md:py-24">
        <div className="grid gap-14 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Wordmark
              height={32}
              inkColor="var(--color-cream-high)"
              dotColor="var(--color-brand)"
              dividerColor="rgba(244,227,212,0.3)"
            />
            <p className="font-brand-display mt-8 max-w-[28ch] text-[clamp(1.4rem,2.2vw,1.8rem)] font-medium leading-[1.15] text-[var(--color-cream-high)]">
              Hecha para barberías.{" "}
              <em className="italic text-[var(--color-gold)]">Y nada más.</em>
            </p>
          </div>

          <FooterColumn title="Producto">
            <FooterLink href="#como-funciona">Cómo funciona</FooterLink>
            <FooterLink href="#precios">Precios</FooterLink>
            <FooterLink href="#pruebalo">Pruébalo en 30s</FooterLink>
            <FooterLink href={DEMO_URL}>Cuenta demo</FooterLink>
          </FooterColumn>

          <FooterColumn title="Empresa">
            <FooterLink href={PHONE_WA_URL} external>
              WhatsApp +34 {PHONE_DISPLAY}
            </FooterLink>
            <FooterLink href={`tel:${PHONE_TEL}`}>Teléfono</FooterLink>
            <FooterLink href="/login">Entrar</FooterLink>
            <FooterLink href={SIGNUP_URL}>Crear cuenta</FooterLink>
          </FooterColumn>

          <FooterColumn title="Legal">
            <FooterLink href="/aviso-legal">Aviso legal</FooterLink>
            <FooterLink href="/privacidad">Privacidad</FooterLink>
            <FooterLink href="/terminos">Términos</FooterLink>
            <FooterLink href="/legal/verifactu">VeriFactu</FooterLink>
          </FooterColumn>
        </div>

        <div className="mt-20 flex flex-col gap-3 border-t divider-on-dark pt-8 text-xs text-[var(--color-cream-on-dark)]/60 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} otracita. Todos los derechos reservados.</p>
          <p className="font-brand-num">otracita.es · edición 01 / 2026</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-gold)]">
        {title}
      </h3>
      <ul className="mt-5 space-y-3 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="text-[var(--color-cream-on-dark)] transition-colors hover:text-[var(--color-cream-high)]"
      >
        {children}
      </a>
    </li>
  );
}

/* ─── Mocks SVG/CSS de producto ─────────────────────────
 * Reemplazan a la fotografía. Cada uno usa los tokens del proyecto para que
 * leer la landing sea, también, ver la paleta del producto. */

function ChatMock() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[var(--color-overlay)] p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
          WhatsApp · Barbería La Princesa
        </span>
        <span className="font-brand-num text-xs text-[var(--color-ink-3)]">08:42</span>
      </div>
      <div className="flex flex-col gap-2.5 text-[14px] leading-snug">
        <Bubble side="right">Hola, quiero reservar el sábado a las 11.</Bubble>
        <Bubble side="left">
          Hola Carlos. Sábado a las 11 con Andrés está libre. ¿Te lo confirmo?
        </Bubble>
        <Bubble side="right">Sí, gracias.</Bubble>
        <Bubble side="left">
          Confirmado. Te aviso mañana 24 horas antes.
        </Bubble>
      </div>
    </div>
  );
}

function Bubble({
  side,
  children,
}: {
  side: "left" | "right";
  children: React.ReactNode;
}) {
  const isRight = side === "right";
  return (
    <div className={`flex ${isRight ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
          isRight
            ? "rounded-br-sm bg-[var(--color-brand-softer)] text-[var(--color-ink)]"
            : "rounded-bl-sm border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function NotificationMock() {
  return (
    <div className="relative flex h-full w-full flex-col justify-end rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,var(--color-overlay),var(--color-canvas))] p-6">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[0_18px_40px_rgba(42,29,20,0.10)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-softer)]">
            <span className="font-brand-display text-base font-semibold text-[var(--color-brand-strong)]">
              oc
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-2)]">
              <span>otracita</span>
              <span className="text-[var(--color-ink-3)]">ahora</span>
            </div>
            <p className="mt-1 text-[14px] leading-snug text-[var(--color-ink)]">
              Mañana 11:00 con Andrés. Confirma con un toque.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-[var(--color-line-strong)]" aria-hidden="true" />
    </div>
  );
}

function TapMock() {
  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-[28px] border border-[var(--color-line)] bg-[var(--color-overlay)] p-6">
      <div className="relative flex w-full max-w-[220px] flex-col items-center rounded-[32px] bg-[var(--color-espresso)] p-7 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-cream-on-dark)]">
          Cobrar
        </span>
        <p className="font-brand-num mt-3 text-[clamp(2rem,4vw,2.4rem)] font-semibold text-[var(--color-cream-high)]">
          25,00 €
        </p>
        <p className="mt-1 text-xs text-[var(--color-cream-on-dark)]/70">
          Corte + barba
        </p>
        <div className="my-7 h-px w-full bg-[var(--color-cream-on-dark)]/15" />
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-gold)]">
          Acerca la tarjeta
        </p>
        {/* Tarjeta abstracta orbitando */}
        <div className="mt-5 h-9 w-16 rounded-md bg-[linear-gradient(135deg,var(--color-gold),var(--color-cream-on-dark))] shadow-[0_6px_18px_rgba(212,165,116,0.4)]" aria-hidden="true" />
      </div>
    </div>
  );
}

function FacturaMock({ big = false }: { big?: boolean }) {
  return (
    <div
      className={`relative mx-auto flex w-full ${
        big ? "max-w-md" : "max-w-sm"
      } flex-col gap-4 rounded-[20px] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[0_24px_60px_rgba(42,29,20,0.10)]`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
          Factura · 2026-0421
        </span>
        <span className="font-brand-num text-xs text-[var(--color-ink-3)]">
          21/04/2026
        </span>
      </div>
      <h4 className="font-brand-display text-xl font-medium text-[var(--color-ink)]">
        Barbería La Princesa
      </h4>
      <div className="space-y-2 border-t border-[var(--color-line)] pt-4 text-[14px] text-[var(--color-ink-2)]">
        <Row label="Corte de pelo" value="15,00 €" />
        <Row label="Barba con toalla" value="10,00 €" />
      </div>
      <div className="flex items-baseline justify-between border-t border-[var(--color-line)] pt-3">
        <span className="font-semibold text-[var(--color-ink)]">Total</span>
        <span className="font-brand-num text-lg font-semibold text-[var(--color-ink)]">
          25,00 €
        </span>
      </div>
      <div className="mt-2 flex items-end gap-4 border-t border-[var(--color-line)] pt-4">
        <QrMock />
        <div className="flex-1 text-[10px] text-[var(--color-ink-3)]">
          <p className="font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-strong)]">
            VeriFactu AEAT
          </p>
          <p className="mt-1 font-brand-num">Hash 9af2 · 7b14 · d12c</p>
          <p className="mt-1">Firmado el 21/04/2026 a las 11:24</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span>{label}</span>
      <span className="font-brand-num">{value}</span>
    </div>
  );
}

/* QR mock decorativo. No representa un código real, solo el placement. */
function QrMock() {
  // Patrón pseudoaleatorio fijo (no random) para que la apariencia sea
  // estable entre renders y el screenshot del PDF se vea idéntico siempre.
  const cells = [
    1, 1, 1, 0, 1, 0, 1, 1,
    1, 0, 1, 1, 0, 1, 0, 1,
    1, 1, 0, 0, 1, 1, 1, 0,
    0, 1, 1, 0, 0, 0, 1, 1,
    1, 0, 1, 1, 1, 0, 0, 1,
    0, 1, 0, 1, 0, 1, 1, 0,
    1, 1, 0, 0, 1, 0, 1, 1,
    1, 0, 1, 1, 0, 1, 1, 1,
  ];
  return (
    <div
      aria-hidden="true"
      className="grid h-20 w-20 shrink-0 grid-cols-8 gap-px rounded-md bg-[var(--color-line)] p-0.5"
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={`block aspect-square ${
            c ? "bg-[var(--color-ink)]" : "bg-[var(--color-surface)]"
          }`}
        />
      ))}
    </div>
  );
}

function ReviewMock() {
  return (
    <div className="relative flex h-full w-full flex-col justify-center rounded-[28px] border border-[var(--color-line)] bg-[var(--color-overlay)] p-6">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[0_18px_40px_rgba(42,29,20,0.06)]">
        <div className="flex items-center gap-1" aria-label="5 estrellas sobre 5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} />
          ))}
        </div>
        <p className="font-brand-display mt-4 text-[clamp(1.05rem,1.6vw,1.25rem)] font-medium italic leading-snug text-[var(--color-ink)]">
          “Por fin un sitio donde puedo reservar por WhatsApp sin descargar
          nada. Andrés es un crack.”
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-brand-softer)] font-brand-display text-sm font-semibold text-[var(--color-brand-strong)]">
            CM
          </div>
          <div className="text-xs text-[var(--color-ink-2)]">
            <p className="font-semibold text-[var(--color-ink)]">Carlos M.</p>
            <p>Hace 2 días · Google</p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-3)]">
        <span>Propina enviada</span>
        <span className="font-brand-num text-[var(--color-brand-strong)]">+ 3,00 €</span>
      </div>
    </div>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path
        d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77 4.8 17.5l.99-5.78L1.58 7.62l5.82-.85L10 1.5z"
        className="text-[var(--color-gold)]"
      />
    </svg>
  );
}
