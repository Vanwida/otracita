import {
  LayoutDashboard,
  Calendar,
  Users,
  MessageSquare,
  Store,
  Bot,
  CreditCard,
  FileText,
  HelpCircle,
  Smartphone,
  Gift,
  type LucideIcon,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Shared sidebar navigation config.
//
// Single source of truth for the dashboard nav. The desktop sidebar (in
// `layout.tsx`) and the mobile drawer (`MobileSidebar.tsx`) both import from
// here so labels, hrefs, icons and grouping never drift out of sync.
//
// The bottom-nav on mobile uses a pruned subset — see `BOTTOM_NAV` below.
// -----------------------------------------------------------------------------

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

export interface NavSection {
  /** Shown as a small uppercase heading above the group in the sidebar. */
  heading: string;
  items: NavItem[];
}

// Primary nav — flows / daily use.
export const PRIMARY_NAV: NavSection = {
  heading: 'Principal',
  items: [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
    { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda' },
    { href: '/dashboard/clientes', icon: Users, label: 'Clientes' },
    { href: '/dashboard/mensajes', icon: MessageSquare, label: 'Mensajes' },
  ],
};

// Configuration nav — set-and-forget business config.
// "Facturación" = docs the tenant emits to THEIR customers (core feature).
// "Mi plan"     = the subscription we charge THE TENANT (payment admin).
// The naming split makes clear who is billing whom.
export const CONFIG_NAV: NavSection = {
  heading: 'Configuración',
  items: [
    { href: '/dashboard/negocio', icon: Store, label: 'Mi negocio' },
    { href: '/dashboard/bot', icon: Bot, label: 'El bot' },
    { href: '/dashboard/app', icon: Smartphone, label: 'Mi app' },
    { href: '/dashboard/fidelidad', icon: Gift, label: 'Fidelidad' },
    { href: '/dashboard/facturas', icon: FileText, label: 'Facturación' },
    { href: '/dashboard/mi-plan', icon: CreditCard, label: 'Mi plan' },
  ],
};

// Footer nav — help + (admin-only) admin panel.
export const FOOTER_NAV: NavSection = {
  heading: 'Soporte',
  items: [
    { href: '/dashboard/ayuda', icon: HelpCircle, label: 'Ayuda' },
  ],
};

// All sections in display order, handy for the mobile drawer.
export const ALL_NAV_SECTIONS: NavSection[] = [PRIMARY_NAV, CONFIG_NAV, FOOTER_NAV];

// Bottom-nav (mobile) — only 5 slots. Prioritise daily use items. Everything
// else lives in the drawer behind the hamburger.
export const BOTTOM_NAV: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda' },
  { href: '/dashboard/clientes', icon: Users, label: 'Clientes' },
  { href: '/dashboard/negocio', icon: Store, label: 'Negocio' },
];
