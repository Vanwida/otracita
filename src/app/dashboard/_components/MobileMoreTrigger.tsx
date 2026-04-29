'use client'

import { Menu } from 'lucide-react'

/**
 * Bottom-nav "Más" button. Opens the same mobile drawer that the top-bar
 * hamburger controls, via a global custom event that `MobileSidebar` listens
 * to. Keeping this as its own small client component lets the dashboard
 * layout stay a server component.
 */
export default function MobileMoreTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('otracita:open-drawer'))
        }
      }}
      className="flex flex-col items-center justify-center gap-1 min-h-[48px] px-3 py-1.5 text-ink-2 hover:text-ink transition-colors"
      aria-label="Más opciones"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
      <span className="text-[11px] font-medium leading-none">Más</span>
    </button>
  )
}
