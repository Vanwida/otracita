'use client'

import { useEffect, useState } from 'react'

// Bloqueo total en pantallas > 480px. Muestra un overlay "Abre en tu
// móvil" + QR del URL actual para que el barbero pueda escanear con su
// móvil si llegó aquí en desktop por error.

interface Props {
  token: string
  children: React.ReactNode
}

const MAX_MOBILE_WIDTH = 480

export default function MobileGate({ token, children }: Props) {
  const [isDesktop, setIsDesktop] = useState(false)
  const [currentUrl, setCurrentUrl] = useState('')

  useEffect(() => {
    // El primer paint sucede como mobile-OK (state inicial false). Si el
    // viewport es grande, lo flippamos en este efecto. Comparar el state
    // inicial contra el viewport real evita la cascada de re-renders que
    // ESLint marca por setState síncrono no condicional.
    const next = window.innerWidth > MAX_MOBILE_WIDTH
    if (next !== isDesktop) setIsDesktop(next)
    setCurrentUrl((prev) => prev || window.location.href)
    const onResize = () => {
      setIsDesktop(window.innerWidth > MAX_MOBILE_WIDTH)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isDesktop) return <>{children}</>

  const qrSrc = currentUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentUrl)}&format=svg`
    : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-8">
      <div className="max-w-md text-center">
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-softer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-brand"
            aria-hidden="true"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </div>
        <h1 className="mb-2 text-xl font-bold text-ink">Abre en tu móvil</h1>
        <p className="mb-6 text-sm text-ink-2">
          Esta app está pensada para tu móvil. Escanea el código o abre el
          enlace en tu teléfono.
        </p>
        {qrSrc && (
          <div className="mx-auto mb-6 rounded-control border border-line bg-surface p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="Código QR para abrir en el móvil"
              className="mx-auto h-56 w-56"
            />
          </div>
        )}
        <p className="text-xs text-ink-3">Token: ...{token.slice(-6)}</p>
      </div>
    </div>
  )
}
