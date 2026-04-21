'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, Shield, LogOut } from 'lucide-react'
import { authClient } from '@/lib/auth/client'
import { Wordmark } from '@/components/brand'
import { PRIMARY_NAV, CONFIG_NAV, FOOTER_NAV } from './nav-config'

interface Props {
  email: string
  isAdmin: boolean
  needsSetup: boolean
}

const SECTIONS = [PRIMARY_NAV, CONFIG_NAV, FOOTER_NAV]

// Event fired by `MobileMoreTrigger` (the bottom-nav "Más" button) so the
// drawer can be opened from a sibling client component without lifting state
// into the server-rendered layout.
const OPEN_DRAWER_EVENT = 'otracita:open-drawer'

export default function MobileSidebar({ email, isAdmin, needsSetup }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(OPEN_DRAWER_EVENT, handler)
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, handler)
  }, [])

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push('/login')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg text-ink-2 hover:bg-overlay transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={`fixed left-0 top-0 bottom-0 z-50 w-64 bg-sidebar flex flex-col p-5 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center text-ink">
            <Wordmark height={28} />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-sidebar-text hover:text-ink hover:bg-sidebar-hover transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section.heading} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-ink-3">
                {section.heading}
              </p>
              {section.items.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    pathname === href
                      ? 'bg-sidebar-hover text-ink'
                      : 'text-sidebar-text hover:text-ink hover:bg-sidebar-hover'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          ))}

          {isAdmin && (
            <div className="pt-3 mt-2 border-t border-sidebar-line">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg border border-sidebar-line px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-ink hover:bg-sidebar-hover transition-colors"
              >
                <Shield className="h-4 w-4" />
                <span className="font-semibold">Panel admin</span>
              </Link>
            </div>
          )}
        </nav>

        {needsSetup && (
          <div className="bg-sidebar-card border border-sidebar-line rounded-xl p-4 mb-4 mt-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand mb-1">Configuración pendiente</p>
            <p className="text-xs text-ink-2 leading-relaxed">Termina de configurar tu bot para empezar a agendar.</p>
            <Link
              href="/dashboard/setup"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand hover:text-brand-strong transition-colors"
            >
              Continuar →
            </Link>
          </div>
        )}

        <div className="border-t border-sidebar-line pt-4 mt-4">
          <div className="flex items-center gap-3 mb-3 rounded-lg bg-sidebar-card border border-sidebar-line p-3">
            <div className="h-7 w-7 rounded-full bg-brand-softer border border-line text-brand flex items-center justify-center font-bold text-xs shrink-0">
              {email.charAt(0).toUpperCase()}
            </div>
            <div className="truncate text-xs text-sidebar-text font-medium" title={email}>
              {email}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-sidebar-hover transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  )
}
