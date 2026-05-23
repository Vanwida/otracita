'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, TrendingUp, Heart, User } from 'lucide-react'

// Bottom nav fija con 4 tabs. Estilo "Glovo rider / Uber driver".
interface Props {
  token: string
}

export default function BottomNav({ token }: Props) {
  const pathname = usePathname() || ''
  const base = `/r/${token}`

  const tabs = [
    { href: `${base}/agenda`, label: 'Agenda', Icon: Calendar },
    { href: `${base}/ventas`, label: 'Ventas', Icon: TrendingUp },
    { href: `${base}/propinas`, label: 'Propinas', Icon: Heart },
    { href: `${base}/yo`, label: 'Tú', Icon: User },
  ] as const

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      <ul className="flex">
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                  active ? 'text-brand' : 'text-ink-3'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon
                  className={`h-5 w-5 ${active ? 'text-brand' : 'text-ink-3'}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
