'use client'

import { Share2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// TopBar — identidad sticky al hacer scroll: logo + nombre.
//
// La navegación (Mis reservas, Perfil) vive entera en el BottomTabBar para
// no duplicar controles. Aquí sólo mostramos la marca — una franja fina
// que fija la identidad cuando el hero sale del viewport.
//
// Share button opcional a la derecha — usa Web Share API nativa si está
// disponible (iOS, Android); fallback copia al portapapeles. Ayuda a que
// el barbero y sus clientes puedan compartir la URL en WhatsApp/IG.
// -----------------------------------------------------------------------------

interface Props {
  businessName: string
  logoUrl: string | null
  slug: string
}

export default function TopBar({ businessName, logoUrl }: Props) {
  const share = async () => {
    if (typeof navigator === 'undefined') return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = `${businessName} — Reserva online`
    if ('share' in navigator) {
      try {
        await (navigator as Navigator).share({ title, url })
        return
      } catch {
        /* user cancelled — fallthrough */
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* ignore */
    }
  }

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-lg border-b"
      style={{
        background: 'color-mix(in srgb, var(--theme-surface) 88%, transparent)',
        borderColor: 'var(--theme-line)',
      }}
    >
      <div className="mx-auto max-w-3xl px-4 h-12 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-6 w-6 rounded object-cover shrink-0"
            />
          )}
          <span
            className="font-display text-sm font-bold tracking-wide truncate uppercase"
            style={{ color: 'var(--theme-ink)', letterSpacing: '0.05em' }}
          >
            {businessName}
          </span>
        </div>
        <button
          type="button"
          onClick={share}
          aria-label="Compartir"
          className="h-9 w-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--theme-overlay)]"
          style={{ color: 'var(--theme-ink-2)' }}
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
