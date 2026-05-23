// Tipos compartidos del feed /api/yo/today (modo barbero v2 #71).

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
}
