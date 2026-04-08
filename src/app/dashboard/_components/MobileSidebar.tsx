'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu, X,
  LayoutDashboard, Calendar, Wrench, Settings, MessageSquare, Shield, LogOut,
} from 'lucide-react'
import { authClient } from '@/lib/auth/client'

interface Props {
  email: string
  isAdmin: boolean
  needsSetup: boolean
}

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Vista General' },
  { href: '/dashboard/calendar', icon: Calendar, label: 'Calendario' },
  { href: '/dashboard/setup', icon: Wrench, label: 'Configuración Inicial' },
  { href: '/dashboard/settings', icon: Settings, label: 'Ajustes del Bot' },
] as const

export default function MobileSidebar({ email, isAdmin, needsSetup }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  // Close on navigation
  useEffect(() => { setOpen(false) }, [pathname])

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* Hamburger — rendered inside the mobile top bar */}
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg text-ink-2 hover:bg-overlay transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-50 w-64 bg-sidebar flex flex-col p-5 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Agendalo" className="h-7 w-7" />
            <span className="font-bold text-white text-base tracking-wide">Agendalo</span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === href
                  ? 'bg-sidebar-hover text-white'
                  : 'text-sidebar-text hover:text-white hover:bg-sidebar-hover'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}

          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 cursor-not-allowed">
            <MessageSquare className="h-4 w-4" />
            Chats (Pronto)
          </div>

          {isAdmin && (
            <div className="pt-3 mt-4 border-t border-sidebar-line">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg border border-sidebar-line px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
              >
                <Shield className="h-4 w-4" />
                <span className="font-semibold">Panel Admin</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Setup banner */}
        {needsSetup && (
          <div className="bg-sidebar-card border border-sidebar-line rounded-xl p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-500 mb-1">Setup Inicial</p>
            <p className="text-xs text-neutral-500 leading-relaxed">Entrena tu IA para empezar a agendar.</p>
            <Link
              href="/dashboard/setup"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors"
            >
              Comenzar →
            </Link>
          </div>
        )}

        {/* User + sign out */}
        <div className="border-t border-sidebar-line pt-4 mt-4">
          <div className="flex items-center gap-3 mb-3 rounded-lg bg-sidebar-card border border-sidebar-line p-3">
            <div className="h-7 w-7 rounded-full bg-sidebar-line text-neutral-300 flex items-center justify-center font-bold text-xs shrink-0">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="truncate text-xs text-sidebar-text font-medium" title={email}>
              {email}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-sidebar-hover transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    </>
  )
}
