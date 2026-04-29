'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

// -----------------------------------------------------------------------------
// HomeIntroCard — orientación de primera visita en /dashboard.
//
// Razón: la home es deliberadamente silenciosa (un titular Fraunces y poco
// más). Tras eliminar WelcomeBanner por anti-pattern (Sparkles + gradiente),
// los barberos de día 1 no tenían pista de qué hacer aquí. Esta tarjeta lo
// resuelve sin romper la calma del masthead: aparece UNA vez, se cierra,
// nunca vuelve a aparecer.
//
// localStorage flag: cliente-side, suficiente para uso típico (un barbero
// = un navegador). Si cambia de dispositivo verá la intro otra vez,
// aceptable.
// -----------------------------------------------------------------------------

const LS_KEY = 'otracita_home_intro_seen_v1'

export default function HomeIntroCard() {
  // Mostramos null en SSR y hasta que el efecto comprueba localStorage —
  // evita parpadeo (mostrar intro y luego ocultarla en cliente).
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const seen = window.localStorage.getItem(LS_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setShow(true)
  }, [])

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_KEY, '1')
    }
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="mt-6 mb-2 flex items-start gap-3 rounded-xl border border-line bg-overlay/60 px-4 py-3">
      <div className="flex-1 text-sm text-ink-2 leading-relaxed">
        <span className="font-semibold text-ink">Esto es tu Inicio.</span>{' '}
        Aquí solo verás qué toca ahora. Para tu rendimiento, ve a Más → Rendimiento.
        Para € e IVA, a Caja.
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar introducción"
        className="inline-flex items-center justify-center h-8 w-8 -mr-1 -mt-1 rounded-lg text-ink-2 hover:text-ink hover:bg-canvas transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
