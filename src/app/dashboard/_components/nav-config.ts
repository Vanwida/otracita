import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Shared sidebar navigation config.
//
// Mantenemos UN ÚNICO menú de 4 items en el dashboard. La página `Ajustes`
// es un hub que agrupa todas las configuraciones (Tu barbería, Asistente
// WhatsApp, App para clientes, Fidelización, Facturación, Suscripción,
// Ayuda) detrás de tarjetas con preview de estado.
//
// Antes había 11 items mezclando acciones diarias con configuración. El
// rediseño separa esos dos conceptos: las 3 cosas que el barbero hace cada
// día (Inicio, Agenda, Clientes) tienen nivel propio, todo lo de set-and-
// forget vive bajo Ajustes y aparece solo cuando se entra.
//
// El orden importa: el sidebar (desktop) y el bottom-nav (móvil) consumen
// la misma lista para que el orden percibido sea idéntico.
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
  { href: '/dashboard/ajustes', icon: Settings, label: 'Ajustes' },
];

/**
 * Las rutas que viven *dentro* del hub de Ajustes. Sirven para resaltar el
 * link "Ajustes" como activo cuando el usuario está en cualquiera de sus
 * subpáginas (que aún viven en el viejo URL — la Fase 2 las moverá).
 */
const AJUSTES_PREFIXES = [
  '/dashboard/ajustes',
  '/dashboard/negocio',
  '/dashboard/bot',
  '/dashboard/app',
  '/dashboard/fidelidad',
  '/dashboard/facturas',
  '/dashboard/mi-plan',
  '/dashboard/ayuda',
  '/dashboard/resenas',
];

export function isNavItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard/ajustes') {
    return AJUSTES_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (itemHref === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
