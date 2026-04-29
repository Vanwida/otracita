import {
  LayoutDashboard,
  Calendar,
  Users,
  Wallet,
  Menu,
  type LucideIcon,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Shared sidebar navigation config.
//
// Menú principal de 5 items. El barbero piensa en el negocio en términos
// operativos (Inicio, Agenda, Clientes), financieros (Caja) y todo lo
// demás (Más — hub con configuración, marketing, fidelización, etc.).
//
// Decisión "5 items, no 4": la regla original de 4 era para reducir
// fricción mental, pero Caja se mira a diario (cierre de día / facturación)
// y enterrarla en el hub la haría invisible. Industria (Booksy, Fresha)
// usan 5+ y funciona.
//
// La URL del hub sigue siendo /dashboard/ajustes — preservamos para no
// romper bookmarks de barberos beta. Solo cambia el LABEL ("Más") en el
// menú visible.
//
// El orden importa: sidebar (desktop) y bottom-nav (móvil) consumen la
// misma lista para que el orden percibido sea idéntico.
// -----------------------------------------------------------------------------

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda' },
  { href: '/dashboard/clientes', icon: Users, label: 'Clientes' },
  { href: '/dashboard/caja', icon: Wallet, label: 'Caja' },
  { href: '/dashboard/ajustes', icon: Menu, label: 'Más' },
];

/**
 * Las rutas que viven *dentro* del hub "Más" (URL /dashboard/ajustes).
 * Sirven para resaltar el link "Más" como activo cuando el usuario está
 * en cualquiera de sus subpáginas. Caja queda fuera porque tiene su
 * propio item del menú.
 */
const HUB_PREFIXES = [
  '/dashboard/ajustes',
  '/dashboard/negocio',
  '/dashboard/bot',
  '/dashboard/app',
  '/dashboard/fidelidad',
  '/dashboard/facturas',
  '/dashboard/mi-plan',
  '/dashboard/ayuda',
  '/dashboard/resenas',
  '/dashboard/marketing',
  '/dashboard/rendimiento',
];

export function isNavItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard/ajustes') {
    return HUB_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (itemHref === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
