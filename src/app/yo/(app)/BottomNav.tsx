'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  TrendingUp,
  Heart,
  User,
  LineChart,
  Users,
  Scissors,
} from 'lucide-react';
import type { ManagerPermission } from '@/lib/manager-permissions';

// -----------------------------------------------------------------------------
// BottomNav dinámica (#72) — la nav muestra solo las tabs disponibles según
// permisos. Base 4 tabs (Agenda, Ventas, Propinas, Tú). Manager añade:
//   · Finanzas  — si tiene `view_finances`.
//   · Equipo    — si tiene `view_commissions` o `edit_team_clients`.
//   · Servicios — si tiene `edit_services`.
//
// Si superan 6 tabs, scroll horizontal en la nav (touch-pan).
// -----------------------------------------------------------------------------

interface Tab {
  href: string;
  label: string;
  Icon: typeof Calendar;
}

interface Props {
  /** Claves de permisos manager activos del barbero (vacío si operator). */
  permissions: ManagerPermission[];
}

export default function BottomNav({ permissions }: Props) {
  const pathname = usePathname() || '';
  const has = (k: ManagerPermission) => permissions.includes(k);

  const tabs: Tab[] = [
    { href: '/yo/agenda', label: 'Agenda', Icon: Calendar },
    { href: '/yo/ventas', label: 'Ventas', Icon: TrendingUp },
    { href: '/yo/propinas', label: 'Propinas', Icon: Heart },
  ];

  if (has('view_finances')) {
    tabs.push({ href: '/yo/finanzas', label: 'Finanzas', Icon: LineChart });
  }
  if (has('view_commissions') || has('edit_team_clients')) {
    tabs.push({ href: '/yo/equipo', label: 'Equipo', Icon: Users });
  }
  if (has('edit_services')) {
    tabs.push({ href: '/yo/servicios', label: 'Servicios', Icon: Scissors });
  }

  // "Tú" siempre al final (ancla de identidad / logout).
  tabs.push({ href: '/yo/tu', label: 'Tú', Icon: User });

  const scrolls = tabs.length > 5;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Navegación principal"
    >
      <ul
        className={
          scrolls
            ? 'flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : 'flex'
        }
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li
              key={href}
              className={scrolls ? 'min-w-[72px] flex-shrink-0 flex-grow' : 'flex-1'}
            >
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
          );
        })}
      </ul>
    </nav>
  );
}
