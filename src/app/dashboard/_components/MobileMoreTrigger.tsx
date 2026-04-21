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
      className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
      aria-label="Más opciones"
    >
      <Menu className="h-5 w-5" />
      <span className="text-[10px] font-medium">Más</span>
    </button>
  )
}
