'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Users,
  LayoutDashboard,
  FileText,
  Activity,
  CheckSquare,
  CreditCard,
  Receipt,
  MessageSquare,
  ServerCog,
  Search,
} from 'lucide-react';

/**
 * Admin sidebar navigation. Lives as a client component so the active state
 * follows the current pathname automatically — adding a new admin page only
 * means appending a row to `NAV_GROUPS` below, no manual `active` flag.
 *
 * Grouped into Ops / Negocio / Sistema so the menu scales as the admin grows
 * (the spec target is <12 items; we add the section headers once we cross 6).
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Optional badge — surfaces a number-of-things-needing-attention pill next to
   * the label. The count is computed server-side and passed in via props, so
   * the badges in the sidebar match what the page itself shows.
   */
  badgeKey?: keyof AdminNavBadges;
}

interface NavGroupDef {
  label: string;
  items: NavItem[];
}

export interface AdminNavBadges {
  onboarding?: number;
  leads?: number;
  verifactu?: number;
  bot?: number;
  parser?: number;
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    label: 'Ops',
    items: [
      { href: '/admin', label: 'Inicio', icon: LayoutDashboard },
      { href: '/admin/buscar', label: 'Buscar', icon: Search },
      { href: '/admin/onboarding', label: 'Onboarding', icon: CheckSquare, badgeKey: 'onboarding' },
      { href: '/admin/clients', label: 'Clientes', icon: Users },
      { href: '/admin/leads', label: 'Leads', icon: FileText, badgeKey: 'leads' },
    ],
  },
  {
    label: 'Negocio',
    items: [
      { href: '/admin/billing', label: 'Billing', icon: CreditCard },
      { href: '/admin/verifactu', label: 'VeriFactu', icon: Receipt, badgeKey: 'verifactu' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/admin/bot', label: 'Bot WhatsApp', icon: MessageSquare, badgeKey: 'bot' },
      { href: '/admin/email-health', label: 'Parser Booksy', icon: Activity, badgeKey: 'parser' },
      { href: '/admin/system', label: 'Infraestructura', icon: ServerCog },
    ],
  },
];

export function AdminSidebarNav({ badges }: { badges: AdminNavBadges }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === '/admin') return pathname === '/admin';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto -mx-2 px-2">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-3">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? 'relative flex items-center gap-3 rounded-xl bg-brand-softer border-l-2 border-brand px-3 py-2.5 text-sm font-medium text-ink'
                      : 'flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-sidebar-text transition-colors hover:bg-sidebar-hover hover:text-ink'
                  }
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-brand' : ''}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge && badge > 0 && (
                    <span className="inline-flex min-w-[1.25rem] h-5 items-center justify-center rounded-full bg-danger/10 border border-danger/30 px-1.5 text-[10px] font-bold text-danger">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
