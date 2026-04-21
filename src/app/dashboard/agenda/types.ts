export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: number;
  barber: string | null;
  source: string;
  status: string;
  customerPhone: string;
  customerName: string | null;
  price: number | null;
  service: string;
}
