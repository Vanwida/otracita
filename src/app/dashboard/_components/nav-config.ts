import {
  Calendar,
  Wallet,
  TrendingUp,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Shared sidebar navigation config.
//
// 4 tabs, regla aplicada: top-level sólo si (a) se usa varias veces al día Y
// (b) el acceso urgente importa (cliente delante, no puedes hacer 2 clicks):
//
//   Agenda   · diario      · operativa (cliente esperando)
//   Caja     · diario      · cobros (cliente en mostrador)
//   Crecer   · semanal     · cartera + reseñas + fidelidad + marketing
//   Ajustes  · mensual     · configuración + admin
//
// "Inicio" (la portada one-question en /dashboard) sigue accesible desde el
// logo del header, pero no ocupa un tab — el workspace real es Agenda.
//
// "Clientes" antes era tab top-level — fuera. Un barbero no busca clientes
// a diario: la cita en Agenda ya trae el contexto. La lista vive ahora
// como card en Crecer ("¿quién no viene? ¿quién falla? ¿quién está
// bloqueado?") — preguntas que sí se accionan, no KPIs vanity.
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
  { href: '/dashboard/agenda', icon: Calendar, label: 'Agenda' },
  { href: '/dashboard/caja', icon: Wallet, label: 'Caja' },
  { href: '/dashboard/crecer', icon: TrendingUp, label: 'Crecer' },
  { href: '/dashboard/ajustes', icon: Settings, label: 'Ajustes' },
];

// Rutas que viven *dentro* del hub Crecer — resaltan el tab cuando estás en
// cualquiera de sus subpáginas.
const CRECER_PREFIXES = [
  '/dashboard/crecer',
  '/dashboard/clientes',
  '/dashboard/resenas',
  '/dashboard/fidelidad',
  '/dashboard/marketing',
];

// Rutas que viven *dentro* del hub Ajustes.
const AJUSTES_PREFIXES = [
  '/dashboard/ajustes',
  '/dashboard/negocio',
  '/dashboard/bot',
  '/dashboard/app',
  '/dashboard/mi-plan',
  '/dashboard/facturas',
  '/dashboard/ayuda',
];

// Rutas que viven *dentro* del tab Caja.
const CAJA_PREFIXES = [
  '/dashboard/caja',
  '/dashboard/finanzas',
];

export function isNavItemActive(itemHref: string, pathname: string): boolean {
  if (itemHref === '/dashboard/crecer') {
    return CRECER_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (itemHref === '/dashboard/ajustes') {
    return AJUSTES_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  if (itemHref === '/dashboard/caja') {
    return CAJA_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
