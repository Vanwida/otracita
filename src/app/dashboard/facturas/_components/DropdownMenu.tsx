'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Check } from 'lucide-react'

// -----------------------------------------------------------------------------
// DropdownMenu — dropdown controlado (no `<select>` nativo).
//
// Por qué: en iPadOS/Safari, el `<select>` nativo abre su popover donde iOS
// decide (a veces descolocado, a veces como wheel mobile). Para un barbero
// que usa iPad como POS, eso es UX amateur. Aquí montamos el dropdown
// nosotros: aparece siempre justo debajo del trigger, con click-outside,
// ESC para cerrar, y opciones que son <Link> (navegación URL-driven, sin
// estado extra de React).
//
// Cada opción es una URL que añade/cambia query params. Cuando el usuario
// clica, Next navega. Cero JS de submit.
// -----------------------------------------------------------------------------

export interface DropdownOption {
  /** Valor interno (key, para comparar con selected). */
  value: string
  /** Label visible. */
  label: string
  /** URL a navegar cuando se selecciona esta opción. */
  href: string
}

interface Props {
  /** Label aria + placeholder si no hay selected. */
  label: string
  options: DropdownOption[]
  /** Valor actualmente seleccionado. */
  selected: string
  /** Ancho mínimo del botón. Default suficiente para un mes. */
  minWidth?: string
}

export default function DropdownMenu({ label, options, selected, minWidth = '10rem' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const currentLabel = options.find((o) => o.value === selected)?.label ?? label

  // Cerrar al click fuera / touch fuera.
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [open])

  // Escape cierra y devuelve focus al botón.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-between gap-2 bg-surface border border-line rounded-xl px-4 py-2.5 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-colors hover:border-line-strong"
        style={{ minWidth }}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-ink-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute top-full left-0 mt-1.5 min-w-full bg-surface border border-line rounded-xl shadow-xl overflow-hidden z-40 py-1 max-h-80 overflow-y-auto"
          style={{ minWidth }}
        >
          {options.map((opt) => {
            const isSelected = opt.value === selected
            return (
              <Link
                key={opt.value}
                href={opt.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                role="option"
                aria-selected={isSelected}
                className={`flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors ${
                  isSelected
                    ? 'bg-brand-softer text-ink font-medium'
                    : 'text-ink-2 hover:bg-overlay hover:text-ink'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-4 w-4 text-brand shrink-0" />}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
