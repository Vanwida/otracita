import {
  Calendar,
  Wallet,
  Users,
  TrendingUp,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Shared sidebar navigation config.
//
// 5 tabs. La regla "máximo 4" se relajó porque la dispersión del contenido
// (equipo en 5 sitios, finanzas en 2, etc.) hacía MÁS daño que la sobrecarga
// de la nav. Un tab más con un modelo mental claro > buscar lo del equipo
// en 5 sitios distintos.
//
//   Agenda   · diario      · operativa (cliente esperando)
//   Caja     · diario      · cobros + facturas VeriFactu + KPIs
//   Equipo   · mensual     · barberos · bonos · nóminas · cómo cobra cada uno
//   Crecer   · semanal     · clientes + reseñas + fidelidad + marketing
//   Ajustes  · mensual     · setup raro (info negocio, bot, app, plan, ayuda)
//
// "Inicio" (la portada one-question en /dashboard) sigue accesible desde el
// logo del header, pero no ocupa un tab — el workspace real es Agenda.
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
  { href: '/dashboard/equipo', icon: Users, label: 'Equipo' },
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

// Rutas que viven *dentro* del hub Ajustes. Ya no incluye /facturas (se
// movió a Caja porque se usa a diario) ni cosas del equipo (Equipo es
// su propio tab ahora).
const AJUSTES_PREFIXES = [
  '/dashboard/ajustes',
  '/dashboard/negocio',
  '/dashboard/bot',
  '/dashboard/app',
  '/dashboard/mi-plan',
  '/dashboard/ayuda',
];

// Rutas que viven *dentro* del tab Caja. Facturas (VeriFactu) se movió
// aquí porque el barbero las emite a diario.
const CAJA_PREFIXES = [
  '/dashboard/caja',
  '/dashboard/finanzas',
  '/dashboard/facturas',
];

// El tab Equipo es plano por ahora — todo en /dashboard/equipo. Si más
// adelante crece (p.ej. /equipo/[barberId]) añadimos prefixes.
const EQUIPO_PREFIXES = [
  '/dashboard/equipo',
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
  if (itemHref === '/dashboard/equipo') {
    return EQUIPO_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}
