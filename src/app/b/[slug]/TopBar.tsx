'use client'

import { useEffect, useState } from 'react'
import { Menu, User, X, LogOut, Calendar } from 'lucide-react'
import Link from 'next/link'

// -----------------------------------------------------------------------------
// TopBar — barra superior tipo app: hamburger + nombre + avatar.
//
// El avatar comprueba si el cliente tiene sesión PWA. Si sí → iniciales del
// nombre; si no → icono genérico que abre flujo de login. El hamburger abre
// un drawer lateral con accesos: Mis reservas / Perfil / Logout.
//
// Usa CSS vars inyectadas por el <main> padre, así vale igual para tema
// oscuro o claro sin recomputar nada.
// -----------------------------------------------------------------------------

interface Props {
  businessName: string
  logoUrl: string | null
  slug: string
}

interface MeResponse {
  loggedIn: boolean
  user?: { name: string | null; phone: string }
}

function initials(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function TopBar({ businessName, logoUrl, slug }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [me, setMe] = useState<MeResponse | null>(null)

  useEffect(() => {
    fetch('/api/app/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: MeResponse) => setMe(d))
      .catch(() => setMe({ loggedIn: false }))
  }, [])

  // Bloquear scroll del body mientras el drawer está abierto.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const logout = async () => {
    await fetch('/api/app/logout', { method: 'POST' }).catch(() => null)
    setMe({ loggedIn: false })
    setDrawerOpen(false)
  }

  return (
    <>
      <header
        className="sticky top-0 z-30 backdrop-blur-lg border-b"
        style={{
          background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
          borderColor: 'var(--theme-line)',
        }}
      >
        <div className="mx-auto max-w-3xl px-3 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--theme-overlay)]"
            style={{ color: 'var(--brand-strong)' }}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                className="h-7 w-7 rounded-md object-cover shrink-0"
              />
            )}
            <span
              className="font-display text-base sm:text-lg font-bold tracking-tight truncate uppercase"
              style={{ color: 'var(--brand-strong)', letterSpacing: '0.05em' }}
            >
              {businessName}
            </span>
          </div>

          <Link
            href="/app"
            aria-label={me?.loggedIn ? 'Mi perfil' : 'Iniciar sesión'}
            className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold overflow-hidden transition-transform active:scale-95"
            style={{
              background: me?.loggedIn ? 'var(--brand)' : 'var(--theme-overlay)',
              color: me?.loggedIn ? 'var(--brand-ink)' : 'var(--theme-ink-2)',
              border: `1px solid ${me?.loggedIn ? 'transparent' : 'var(--theme-line)'}`,
            }}
          >
            {me?.loggedIn ? (
              initials(me.user?.name) || <User className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
          </Link>
        </div>
      </header>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[85%] max-w-xs shadow-2xl flex flex-col"
            style={{ background: 'var(--theme-surface)' }}
          >
            <div
              className="flex items-center gap-3 p-4 border-b"
              style={{ borderColor: 'var(--theme-line)' }}
            >
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-bold truncate" style={{ color: 'var(--theme-ink)' }}>
                  {businessName}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--theme-ink-3)' }}>
                  otracita.es/b/{slug}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Cerrar menú"
                className="h-9 w-9 rounded-full flex items-center justify-center"
                style={{ color: 'var(--theme-ink-2)' }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 p-2 space-y-1">
              <DrawerLink href="/app" icon={Calendar} label="Mis reservas" />
              <DrawerLink href="/app" icon={User} label={me?.loggedIn ? 'Mi perfil' : 'Iniciar sesión'} />
            </nav>

            {me?.loggedIn && (
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-3 m-2 px-3 py-3 rounded-lg text-sm font-medium transition-colors"
                style={{ color: 'var(--theme-ink-2)' }}
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            )}

            <p
              className="text-[11px] text-center p-3 border-t"
              style={{ color: 'var(--theme-ink-3)', borderColor: 'var(--theme-line)' }}
            >
              Tecnología por <a href="https://otracita.es" className="underline">otracita.es</a>
            </p>
          </aside>
        </div>
      )}
    </>
  )
}

function DrawerLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Calendar
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--theme-overlay)]"
      style={{ color: 'var(--theme-ink)' }}
    >
      <Icon className="h-4 w-4" style={{ color: 'var(--brand-strong)' }} />
      {label}
    </Link>
  )
}
