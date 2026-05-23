// Tipos compartidos del feed /api/yo/today (modo barbero v2 #71).

import type { ManagerPermission } from '@/lib/manager-permissions';

export interface BarberBooking {
  id: string;
  date: string;
  time: string;
  duration: number;
  service: string;
  customerName: string | null;
  customerPhone: string;
  price: number | null;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  paymentMethod: 'cash' | 'card' | 'online' | 'mixed' | null;
}

export interface TodayFeed {
  barber: {
    id: string;
    name: string;
    photoUrl: string | null;
    role: string | null;
  };
  /**
   * Barbero "real" del usuario autenticado. Diferente de `barber` cuando un
   * manager con `edit_others_bookings` está visualizando la agenda de otro
   * barbero del equipo. Para operator/manager mirando su propia agenda,
   * `self.id === barber.id`.
   */
  self?: {
    id: string;
    name: string;
  };
  /**
   * Equipo completo (id+name) si el caller tiene `edit_others_bookings`.
   * Permite al selector de la agenda elegir a otro barbero. Vacío si no
   * tiene permiso.
   */
  team?: { id: string; name: string }[];
  client: {
    id: string;
    businessName: string | null;
  };
  today: {
    date: string;
    bookings: BarberBooking[];
  };
  tomorrow: {
    date: string;
    bookings: BarberBooking[];
  };
  week: {
    start: string;
    end: string;
    bookings: BarberBooking[];
  };
  sales: {
    todayCents: number;
    todayCount: number;
    weekCents: number;
    monthCents: number;
  };
  tips: {
    todayCents: number;
    todayCount: number;
    cashEntregadaCents: number;
    cardPendienteCents: number;
  };
  /**
   * Permisos granulares del barbero (#72). Si `isManager=false` el array
   * `permissions` viene vacío — operator puro. Si Manager, contiene las
   * claves activas del catálogo. La bottom nav y los botones de acción
   * se gatean leyendo esta info.
   */
  permissions: {
    isManager: boolean;
    keys: ManagerPermission[];
  };
}
