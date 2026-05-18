'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, Shield } from 'lucide-react'
import { authClient } from '@/lib/auth/client'

// -----------------------------------------------------------------------------
// RailUserMenu — avatar icon-only en el pie del rail de iconos.
//
// El rail (w-16) no tiene sitio para la tarjeta de email + botón "Cerrar
// sesión" que tenía el sidebar w-60. La info se mueve a un popover que
// se abre al pulsar el avatar: muestra el email, "Panel admin" (si procede)
// y "Cerrar sesión". Mismo flujo de signout que MobileSidebar
// (`authClient.signOut()` + redirect a /login).
// -----------------------------------------------------------------------------

interface Props {
  email: string
  isAdmin: boolean
}

export default function RailUserMenu({ email, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const wrapRef = useRef<HTMLDivElement>(null)

  // Cierra el popover al click fuera o Escape — patrón estándar de menú.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push('/login')
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menú de cuenta"
        aria-haspopup="menu"
        aria-expanded={open}
        title={email}
        className="h-9 w-9 rounded-full bg-brand-softer border border-line text-brand flex items-center justify-center font-bold text-xs hover:border-line-strong transition-colors"
      >
        {email.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-0 left-full ml-2 w-56 rounded-xl border border-line bg-surface shadow-lg p-2 z-50"
        >
          <div className="px-3 py-2 border-b border-line mb-1">
            <p className="text-[11px] uppercase tracking-widest text-ink-3 font-bold mb-0.5">
              Sesión
            </p>
            <p className="text-xs text-ink-2 font-medium truncate" title={email}>
              {email}
            </p>
          </div>

          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:text-ink hover:bg-overlay transition-colors"
            >
              <Shield className="h-4 w-4" />
              Panel admin
            </Link>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-overlay transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
