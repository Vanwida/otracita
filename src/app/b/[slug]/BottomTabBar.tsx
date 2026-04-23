'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home, Scissors, Calendar, User } from 'lucide-react'

// -----------------------------------------------------------------------------
// BottomTabBar — barra inferior tipo app: 4 tabs.
//
// Inicio  — scroll al hero
// Servicios — scroll a la sección de servicios
// Reservar — scroll al flujo de reserva (el CTA principal)
// Perfil   — abre /app (mis reservas + perfil PWA)
//
// La tab activa se infiere del scroll (IntersectionObserver sobre anchors).
// Safe-area-inset para iPhone X+ y notches.
// -----------------------------------------------------------------------------

type Tab = 'inicio' | 'servicios' | 'reservar' | 'perfil'

interface Props {
  slug: string
  /** Si la página es un sub-route (ej. /cuenta), fija la tab activa aquí y
   *  deshabilita el IntersectionObserver — el scroll-spy solo tiene sentido
   *  en la home de la barbería. */
  activeTab?: Tab
}

export default function BottomTabBar({ slug, activeTab }: Props) {
  const [active, setActive] = useState<Tab>(activeTab ?? 'inicio')

  // Observar qué sección está en viewport para marcar la tab correcta.
  // Solo en la página home de la barbería (donde hay los anchors).
  useEffect(() => {
    if (typeof window === 'undefined' || activeTab) return
    const sections: Array<{ id: string; tab: Tab }> = [
      { id: 'hero', tab: 'inicio' },
      { id: 'servicios', tab: 'servicios' },
      { id: 'reservar', tab: 'reservar' },
    ]
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        // Tomar el más alto en viewport.
        const top = visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0]
        const match = sections.find((s) => s.id === top.target.id)
        if (match) setActive(match.tab)
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
    )
    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [activeTab])

  const scrollTo = (id: string) => () => {
    // Si estamos fuera de la home de la barbería, primero navegamos allí
    // con el anchor; si estamos dentro, solo scroll.
    if (activeTab) {
      window.location.href = `/b/${slug}#${id}`
      return
    }
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 border-t backdrop-blur-xl"
      style={{
        background: 'color-mix(in srgb, var(--theme-surface) 92%, transparent)',
        borderColor: 'var(--theme-line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto max-w-3xl grid grid-cols-4 h-16">
        <TabButton
          label="Inicio"
          icon={Home}
          active={active === 'inicio'}
          onClick={scrollTo('hero')}
        />
        <TabButton
          label="Servicios"
          icon={Scissors}
          active={active === 'servicios'}
          onClick={scrollTo('servicios')}
        />
        <TabButton
          label="Reservar"
          icon={Calendar}
          active={active === 'reservar'}
          onClick={scrollTo('reservar')}
          highlight
        />
        <TabLink
          label="Perfil"
          icon={User}
          href={`/b/${slug}/cuenta`}
          active={activeTab === 'perfil'}
        />
      </div>
    </nav>
  )
}

function TabButton({
  label,
  icon: Icon,
  active,
  onClick,
  highlight,
}: {
  label: string
  icon: typeof Home
  active: boolean
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
      aria-pressed={active}
    >
      <div
        className="rounded-full flex items-center justify-center transition-all"
        style={{
          height: 32,
          width: highlight && active ? 64 : 44,
          background: active
            ? highlight
              ? 'var(--brand)'
              : 'var(--brand-soft)'
            : 'transparent',
          color: active
            ? highlight
              ? 'var(--brand-ink)'
              : 'var(--brand-strong)'
            : 'var(--theme-ink-3)',
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span
        className="text-[10px] font-semibold"
        style={{
          color: active ? 'var(--theme-ink)' : 'var(--theme-ink-3)',
        }}
      >
        {label}
      </span>
    </button>
  )
}

function TabLink({
  label,
  icon: Icon,
  href,
  active,
}: {
  label: string
  icon: typeof Home
  href: string
  active?: boolean
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
      aria-current={active ? 'page' : undefined}
    >
      <div
        className="rounded-full flex items-center justify-center transition-all"
        style={{
          height: 32,
          width: 44,
          background: active ? 'var(--brand-soft)' : 'transparent',
          color: active ? 'var(--brand-strong)' : 'var(--theme-ink-3)',
        }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span
        className="text-[10px] font-semibold"
        style={{
          color: active ? 'var(--theme-ink)' : 'var(--theme-ink-3)',
        }}
      >
        {label}
      </span>
    </Link>
  )
}
