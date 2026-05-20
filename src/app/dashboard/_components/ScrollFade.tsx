'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// -----------------------------------------------------------------------------
// ScrollFade — wrapper para scroll horizontal aceptado con feedback visual.
//
// Cuando un grid (turnos, agenda timegrid, P&L meses) es inherentemente más
// ancho que el viewport mobile, no hay forma de stackearlo sin perder la
// matriz. La solución estándar: scroll-X explícito + sombras edge que avisan
// "hay más a la derecha / izquierda".
//
// Implementación: cliente con ref al contenedor scrollable. Listener pasivo
// de scroll + ResizeObserver actualizan `canScrollLeft` / `canScrollRight`.
// Dos gradientes absolute-positioned se renderizan según estado.
//
// Uso:
//   <ScrollFade>
//     <div className="min-w-[44rem]">…matriz ancha…</div>
//   </ScrollFade>
//
// AAA: las sombras son decorativas — el scroll funciona con teclado / touch
// igual sin ellas. aria-hidden en las pseudo-sombras.
// -----------------------------------------------------------------------------

interface Props {
  children: ReactNode
  /** Clases extra del contenedor externo. */
  className?: string
}

export default function ScrollFade({ children, className = '' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const left = el.scrollLeft
      const max = el.scrollWidth - el.clientWidth
      setCanScrollLeft(left > 1)
      setCanScrollRight(left < max - 1)
    }

    update()
    el.addEventListener('scroll', update, { passive: true })

    // ResizeObserver — cuando cambia el ancho del wrapper (rotación tablet,
    // colapso de rail) recalculamos. Sin esto el fade se queda obsoleto.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // Si el contenido interno crece (filas dinámicas), también escuchamos.
    if (el.firstElementChild) ro.observe(el.firstElementChild)

    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        // Smooth touch scroll en iOS y evitar bounce horizontal raro.
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>

      {/* Sombras edge — decorativas, fuera del flow del DOM accesible. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-6 transition-opacity duration-200 ${
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'linear-gradient(to right, color-mix(in srgb, var(--color-canvas) 90%, transparent), transparent)',
        }}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-6 transition-opacity duration-200 ${
          canScrollRight ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          background:
            'linear-gradient(to left, color-mix(in srgb, var(--color-canvas) 90%, transparent), transparent)',
        }}
      />
    </div>
  )
}
