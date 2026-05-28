'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Loader2, Megaphone, X, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { isMobileViewport } from '@/lib/responsive';
import WeekGrid from './WeekGrid';
import MonthGrid from './MonthGrid';
import DayGrid from './DayGrid';
import AgendaSideRail from './AgendaSideRail';
import BookingDetailPanel from './BookingDetailPanel';
import NewBookingPanel from './NewBookingPanel';
import PromosFillModal from './PromosFillModal';
import SlotActionMenu from './SlotActionMenu';
import BarberActionMenu from './BarberActionMenu';
import BarberVisibilityControl from './BarberVisibilityControl';
import AbsenceModal from '../equipo/turnos/AbsenceModal';
import BlockModal from '../equipo/turnos/BlockModal';
import { useConfirm } from '../_components/ConfirmDialog';
import type { CalendarEvent, CalendarBlock, Barber, SlotAction } from './types';

/** Respuesta cruda del endpoint `/api/dashboard/calendar`. Antes era
 *  `CalendarEvent[]` directo; ahora es `{ events, blocks }` para que la
 *  agenda pinte también los descansos / ausencias del barbero. */
interface CalendarPayload {
  events: CalendarEvent[];
  blocks: CalendarBlock[];
}
const EMPTY_PAYLOAD: CalendarPayload = { events: [], blocks: [] };

interface Props {
  /** Servicios configurados del cliente (`clients.chatbotServices`). El
   *  campo opcional `colorToken` alimenta el color del bloque en agenda
   *  (#33 — color por servicio, no por estado). Se propaga a
   *  DayGrid/WeekGrid/MonthGrid. */
  services: Array<{
    name: string;
    duration: number;
    price: number;
    colorToken?: string | null;
  }>;
  barbers: Barber[];
  blockedDates: string[];
  hours: Record<string, string> | null;
  /**
   * Resolved Stripe Connect state — drives whether the BookingDetailPanel
   * shows the "Activa cobros" CTA or the "Generar link de pago" flow.
   */
  stripeConnectStatus: 'none' | 'pending' | 'active' | 'restricted' | string;
  /** Cuando true, muestra el botón "Llenar huecos" en la cabecera. */
  promosEnabled: boolean;
  /** Cuando true, al "Marcar completada" se pide método de pago para
   *  alimentar el cuadre de caja. */
  cashRegisterEnabled?: boolean;
  /** SumUp+Reader pareados → cobro instantáneo Cloud API en vez de modal
   *  manual cash/card/online. */
  sumupReaderConnected?: boolean;
  /**
   * Modo móvil compacto (`/yo/agenda`). Cuando true:
   *   · oculta el rail lateral (toggle + drawer) — solo Día visible.
   *   · oculta el toggle Día/Semana/Mes (la vista queda fijada en Día).
   *   · oculta "Importar" y "Llenar huecos" (admin-only).
   *   · "Nueva cita" pasa a botón FAB flotante (icon-only) para no robar
   *     espacio al header en pantallas de 360px.
   * El resto del flow (DayGrid, drag&drop, BookingDetailPanel, NewBookingPanel)
   * es el mismo — operativo total desde móvil.
   */
  mobileMode?: boolean;
  /**
   * ID canónico del barbero al que restringir la vista (modo móvil del
   * barbero). Se pasa como `barberId` en la query SWR al endpoint
   * `/api/dashboard/calendar`, que filtra server-side. El endpoint ya
   * refuerza la restricción (si el actor no tiene `edit_others_bookings`
   * ignora el override y fuerza su propio id).
   */
  barberFilterId?: string | null;
}

export default function CalendarView({ services, barbers, blockedDates, hours, stripeConnectStatus, promosEnabled, cashRegisterEnabled = false, sumupReaderConnected = false, mobileMode = false, barberFilterId = null }: Props) {
  const confirm = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Task #102 v2 — multi-select de visibilidad de barberos.
  //
  // El control vive en la toolbar del header (BarberVisibilityControl).
  // Persiste vía URL `?barbers=<id1>,<id2>` (CSV) → back/refresh-friendly,
  // shareable. Ausente o "todos" = URL limpia.
  //
  // Validación: ignoramos silenciosamente cualquier id que no pertenezca
  // al equipo del tenant (cambio de tienda, link viejo, copia-pega
  // bienintencionada). Si tras filtrar quedan 0 ids válidos, tratamos
  // como "ausente" → mostramos todo el equipo (NO una agenda vacía con
  // "no hay barberos seleccionados").
  //
  // /yo/agenda fuerza `barberFilterId` server-side: ahí el URL param se
  // ignora (el barbero no debería saltarse su scope desde la URL — además
  // el endpoint lo refuerza) y el control no se renderiza.
  const rawUrlBarbers = searchParams?.get('barbers') ?? null;
  const selectedBarberIds = useMemo(() => {
    if (!rawUrlBarbers) return [] as string[];
    const ids = rawUrlBarbers
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const allowed = new Set(barbers.map((b) => b.id));
    const valid = ids.filter((id) => allowed.has(id));
    // 0 válidos OR todos seleccionados → semánticamente "todos". Devolvemos
    // [] para que el resto del componente trate ambos casos igual (sin
    // filtro). Si se seleccionaron todos explícitamente desde el control,
    // el padre tampoco escribe el param (URL limpia).
    if (valid.length === 0 || valid.length === barbers.length) return [];
    return valid;
  }, [rawUrlBarbers, barbers]);

  // Single id derivado: usado para empujar al endpoint cuando hay
  // exactamente uno seleccionado (mejor que pedir todo y filtrar en
  // cliente). En /yo/agenda `barberFilterId` ya viene server-forzado y
  // tiene prioridad.
  const singleSelectedId =
    selectedBarberIds.length === 1 ? selectedBarberIds[0] : null;
  const effectiveBarberFilterId = barberFilterId ?? singleSelectedId;

  /**
   * Equipo VISIBLE para las grids cuando hay filtro activo. DayGrid + WeekGrid
   * consumen esta lista directamente.
   *   · selectedBarberIds = []        → todos los barberos.
   *   · selectedBarberIds = [id]      → 1 sola columna (el endpoint ya
   *                                     filtra; este array hace que las
   *                                     grids pinten solo esa swimlane).
   *   · selectedBarberIds = [a, b, …] → N columnas — el endpoint pide
   *                                     todos los eventos del rango y
   *                                     filtramos client-side abajo.
   *
   * En /yo/agenda con `barberFilterId` server-forzado: colapsamos a ese
   * barbero como antes (compat con v1 y comportamiento descrito en la
   * prop). El control multi-select no se muestra ahí.
   */
  const visibleBarbers = useMemo(() => {
    if (barberFilterId) {
      const own = barbers.find((b) => b.id === barberFilterId);
      return own ? [own] : barbers;
    }
    if (selectedBarberIds.length === 0) return barbers;
    return barbers.filter((b) => selectedBarberIds.includes(b.id));
  }, [barberFilterId, selectedBarberIds, barbers]);

  /**
   * Actualiza la query string conservando el resto de params.
   *   · next = []                       → omite el param (URL limpia, default = todos)
   *   · next.length === barbers.length  → omite el param (idem)
   *   · resto                           → setea `?barbers=id1,id2`
   * push (no replace) para que back ↔ deshacer el filtro funcione natural.
   */
  const setVisibleBarberIds = useCallback(
    (next: string[]) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      const allowed = new Set(barbers.map((b) => b.id));
      const sanitized = next.filter((id) => allowed.has(id));
      if (sanitized.length === 0 || sanitized.length === barbers.length) {
        params.delete('barbers');
      } else {
        params.set('barbers', sanitized.join(','));
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams, barbers],
  );

  const [isPromosOpen, setIsPromosOpen] = useState(false);
  // Día inicial: si la URL trae `?date=YYYY-MM-DD` (deep-link desde la vista
  // de Actividad de Informes → "ver en agenda"), arrancamos ahí; si no, hoy.
  // Solo se lee en el primer render (estado interno a partir de entonces).
  const [currentDay, setCurrentDay] = useState<Date>(() => {
    const raw = searchParams?.get('date');
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = parseISO(raw);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  // En modo móvil del barbero forzamos 'day' (no hay toggle visible). El
  // estado existe igual para compartir lógica con el dashboard admin.
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedBarber, setSelectedBarber] = useState('all');
  // Init SSR-safe: el server NO puede saber si es mobile ni leer
  // localStorage, así que el primer render asume rail VISIBLE (default
  // desktop). El cliente lo ajusta tras hidratar — sin esto React detectaba
  // mismatch porque el lazy-init leía window y daba `true` en mobile
  // mientras server devolvía `false`. Ver `useEffect` debajo.
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem('otracita_agenda_rail_collapsed_v1');
    // Si el usuario ya expresó preferencia, respetar. Sin preferencia:
    // mobile (<md) default-colapsado (el rail de 240px taparía la agenda).
    // Breakpoint canónico en `src/lib/responsive.ts`.
    if (stored !== null) {
      setRailCollapsed(stored === '1');
    } else if (isMobileViewport()) {
      setRailCollapsed(true);
    }
  }, []);
  function toggleRail() {
    setRailCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('otracita_agenda_rail_collapsed_v1', next ? '1' : '0');
      }
      return next;
    });
  }
  // El panel de detalle se IDENTIFICA por id, no por snapshot. Antes
  // guardábamos el CalendarEvent entero aquí y se lo pasábamos como prop
  // fija al BookingDetailPanel → cualquier mutación dentro del drawer
  // (no-show, editar servicio, marcar origen, cobrar, añadir producto…)
  // dejaba el panel con datos viejos hasta cerrar y reabrir. Ahora
  // derivamos `selectedBooking` de la lista SWR `events`: cada `refetch()`
  // refresca tanto la rejilla como el panel.
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [newBookingSlot, setNewBookingSlot] = useState<{
    date: string;
    time: string;
    barberId: string | null;
  }>({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
    barberId: null,
  });
  // Menú contextual de slot (A7). null = cerrado.
  const [slotMenu, setSlotMenu] = useState<{
    date: string;
    time: string;
    barberId: string | null;
  } | null>(null);
  // Menú de acciones de barbero (fix #2). null = cerrado.
  const [barberMenu, setBarberMenu] = useState<Barber | null>(null);
  // K1 — el slot context-menu ("Añadir falta de disponibilidad" /
  // "Añadir ausencia") abre los MISMOS modales que BarberActionMenu
  // (BlockModal/AbsenceModal de Equipo>Turnos, mismo endpoint), prefijados
  // con el barbero+fecha del hueco. Antes era un no-op silencioso porque
  // agenda/page.tsx nunca pasaba onSelectSlotAction. null = cerrado.
  const [slotBlock, setSlotBlock] = useState<{
    kind: 'unavailability' | 'absence';
    barber: Barber;
    date: string;
    /** Hora del slot clicado (HH:MM). El BlockModal la usa como defaultStart
     *  para no resetear a 16:00 — antes parecía "no responde" porque se
     *  saltaba al default y el barbero no notaba el cambio. */
    time?: string;
  } | null>(null);
  // Error transitorio de un movimiento de cita (drag&drop / mover manual).
  // Se autolimpia; el rollback visual lo hace el revalidate de SWR.
  const [moveError, setMoveError] = useState<string | null>(null);
  // Build the calendar fetch URL from the current view. SWR keys by URL so
  // changing view/date/barber automatically triggers a new request — and
  // a background poll every 10s keeps the grid in sync when the bot creates
  // a booking or another device updates one.
  const fetchUrl = useMemo(() => {
    let start: string;
    let end: string;
    if (viewMode === 'day') {
      start = format(currentDay, 'yyyy-MM-dd');
      end = start;
    } else if (viewMode === 'week') {
      start = format(startOfWeek(currentDay, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      end = format(endOfWeek(currentDay, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    } else {
      start = format(startOfMonth(currentDay), 'yyyy-MM-dd');
      end = format(endOfMonth(currentDay), 'yyyy-MM-dd');
    }
    // `barberId` (id canónico) tiene prioridad sobre `barber` (nombre)
    // server-side. `/yo/agenda` lo manda con el id del barbero
    // autenticado; el endpoint además fuerza el filtro si el actor no
    // tiene `edit_others_bookings` (defensa en profundidad).
    //
    // Task #102 v2: cuando el usuario selecciona EXACTAMENTE 1 barbero
    // desde BarberVisibilityControl, también lo enviamos aquí
    // (`effectiveBarberFilterId` = `singleSelectedId`) para que el endpoint
    // filtre server-side. Si selecciona >1 barberos (subset), pedimos
    // todo el rango sin filtro y los descartamos en cliente (`events` y
    // `blocks` filtrados abajo) — el payload de una semana es pequeño
    // (KB) y evita añadir un parámetro multi-valor al endpoint.
    const barberIdQuery = effectiveBarberFilterId
      ? `&barberId=${encodeURIComponent(effectiveBarberFilterId)}`
      : '';
    return `/api/dashboard/calendar?start=${start}&end=${end}&barber=${selectedBarber}${barberIdQuery}`;
  }, [currentDay, viewMode, selectedBarber, effectiveBarberFilterId]);

  const {
    data: payload = EMPTY_PAYLOAD,
    isLoading: loading,
    mutate: refetch,
  } = useSWR<CalendarPayload>(fetchUrl, async (url: string) => {
    const r = await fetch(url);
    const d = await r.json();
    // Defensive: shape esperado `{ events, blocks }`. Arrays sueltos
    // (response antigua) caen al fallback. Si el server pasa algo raro,
    // devolvemos vacío en vez de romper la agenda.
    if (d && Array.isArray(d.events) && Array.isArray(d.blocks)) return d;
    if (Array.isArray(d)) return { events: d, blocks: [] };
    return EMPTY_PAYLOAD;
  }, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  // Desestructurado SIEMPRE: el resto del componente sigue usando `events`
  // como un array directo (compat con la API previa). `blocks` se pasa a
  // DayGrid para que los descansos/ausencias se pinten como overlays.
  //
  // Task #102 v2 — filtrado client-side cuando hay un subset de barberos
  // (>1 y < total). El endpoint solo entiende 1 barberId; pedimos el
  // rango completo y descartamos aquí los que no están en `selectedBarberIds`.
  // No aplica cuando hay 0 (todos) o 1 (el endpoint ya filtró) seleccionados,
  // ni cuando `barberFilterId` server-forzado controla la vista.
  const events = useMemo(() => {
    // #108 — ocultar las CANCELADAS del grid. El hueco que dejan queda libre
    // (disponible visualmente para una nueva reserva). El dato NO se borra:
    // persiste en DB y aparece en el log de Actividad (#107). No-show NO se
    // oculta — mantiene su tratamiento morado + emoji. Filtramos aquí (único
    // consumidor del payload del grid) y NO en /api/dashboard/calendar, que
    // sigue siendo genérico (stats/otros usos pueden necesitar las canceladas).
    const visible = payload.events.filter((e) => e.status !== 'cancelled');
    if (
      !barberFilterId &&
      selectedBarberIds.length > 1 &&
      selectedBarberIds.length < barbers.length
    ) {
      const allow = new Set(selectedBarberIds);
      // Citas sin `barberId` (legacy / "sin asignar") se ocultan cuando
      // hay un subset filtrado — el barbero filtra para enfocarse en su
      // equipo, no quiere ver las huérfanas. Si la spec cambia, hacerlo
      // configurable.
      return visible.filter(
        (e) => e.barberId !== null && allow.has(e.barberId),
      );
    }
    return visible;
  }, [payload.events, selectedBarberIds, barberFilterId, barbers.length]);

  const blocks = useMemo(() => {
    if (
      !barberFilterId &&
      selectedBarberIds.length > 1 &&
      selectedBarberIds.length < barbers.length
    ) {
      const allow = new Set(selectedBarberIds);
      return payload.blocks.filter((b) => allow.has(b.barberId));
    }
    return payload.blocks;
  }, [payload.blocks, selectedBarberIds, barberFilterId, barbers.length]);

  const rangeLabel = () => {
    if (viewMode === 'day') {
      // Formato Booksy literal: "Lun., 18 May." (día abreviado + número +
      // mes abreviado). date-fns 'EEE' ya capitaliza con locale es.
      return format(currentDay, "EEE, d MMM", { locale: es });
    }
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDay, { weekStartsOn: 1 });
      const we = endOfWeek(currentDay, { weekStartsOn: 1 });
      const startDay = format(ws, 'd');
      const endFull = format(we, "d MMM yyyy", { locale: es });
      return `${startDay} a ${endFull}`;
    }
    return format(currentDay, 'MMMM yyyy', { locale: es });
  };

  const handlePrev = () => {
    if (viewMode === 'day') setCurrentDay(d => subDays(d, 1));
    else if (viewMode === 'week') setCurrentDay(d => subWeeks(d, 1));
    else setCurrentDay(d => subMonths(d, 1));
  };

  const handleNext = () => {
    if (viewMode === 'day') setCurrentDay(d => addDays(d, 1));
    else if (viewMode === 'week') setCurrentDay(d => addWeeks(d, 1));
    else setCurrentDay(d => addMonths(d, 1));
  };

  const handleTodayClick = () => {
    setCurrentDay(new Date());
  };

  // Clic en hueco vacío → menú contextual (A7). barberId opcional:
  // DayGrid lo pasa (columna clicada); Week/Month llaman con 2 args.
  const handleSlotClick = (date: string, time: string, barberId?: string | null) => {
    setSelectedBookingId(null);
    setIsNewBookingOpen(false);
    setSlotMenu({ date, time, barberId: barberId ?? null });
  };

  // Despacha la opción elegida en el menú. NUEVA CITA → NewBookingPanel
  // prefilled. FALTA DE DISPONIBILIDAD / AUSENCIA → mismos modales que
  // BarberActionMenu (BlockModal/AbsenceModal de Equipo>Turnos), prefijados
  // con el barbero del hueco (o el primero del equipo si la columna no
  // mapea a uno concreto — "Todos"/"Sin asignar"/tienda de 1).
  const handleSlotAction = (action: SlotAction) => {
    setSlotMenu(null);
    if (action.type === 'new_booking') {
      setNewBookingSlot({
        date: action.date,
        time: action.time,
        barberId: action.barberId,
      });
      setIsNewBookingOpen(true);
      return;
    }
    const barber =
      barbers.find((b) => b.id === action.barberId) ?? barbers[0];
    if (!barber) return; // sin equipo no hay a quién bloquear (defensivo)
    setSlotBlock({ kind: action.type, barber, date: action.date, time: action.time });
  };

  // Etiqueta humana del slot para el subtítulo del menú: "lun 18 may · 10:30 · Reni".
  const slotMenuLabel = useMemo(() => {
    if (!slotMenu) return undefined;
    let label = `${format(parseISO(slotMenu.date), "EEE d MMM", { locale: es })} · ${slotMenu.time}`;
    if (slotMenu.barberId) {
      const b = barbers.find((x) => x.id === slotMenu.barberId);
      if (b) label += ` · ${b.name}`;
    }
    return label;
  }, [slotMenu, barbers]);

  // Mover una cita (drag&drop en DayGrid o "mover manual" desde el panel
  // detalle). Optimista: pintamos el cambio YA en la caché de SWR, luego
  // PATCH; al volver revalidamos para reconciliar con el servidor (y
  // deshacer el optimismo si hubo solape/permiso). R1/R3.
  const handleEventMove = useCallback(
    async (
      id: string,
      next: { date: string; time: string; barberId: string | null },
    ) => {
      const current = events.find((e) => e.id === id);
      if (!current) return;
      // No-op si no cambia nada (mismo día, hora y barbero).
      const sameBarber =
        (current.barberId ?? null) === (next.barberId ?? null);
      if (
        current.date === next.date &&
        current.time === next.time &&
        sameBarber
      ) {
        return;
      }
      setMoveError(null);
      const nextBarberName = next.barberId
        ? barbers.find((b) => b.id === next.barberId)?.name ?? current.barber
        : null;

      // 1) Update optimista en la caché SWR (sin revalidar todavía).
      // El payload ahora es `{ events, blocks }` — sólo mutamos `events`,
      // los `blocks` (descansos) se mantienen sin tocar.
      await refetch(
        (prev) => {
          const safe = prev ?? EMPTY_PAYLOAD;
          return {
            events: safe.events.map((e) =>
              e.id === id
                ? {
                    ...e,
                    date: next.date,
                    time: next.time,
                    barberId: next.barberId,
                    barber: nextBarberName,
                  }
                : e,
            ),
            blocks: safe.blocks,
          };
        },
        { revalidate: false },
      );

      // 2) PATCH al endpoint (re-valida solape en servidor).
      const doPatch = (allowOverlap: boolean) =>
        fetch(`/api/bookings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: next.date,
            time: next.time,
            barberId: next.barberId,
            ...(allowOverlap ? { allowOverlap: true } : {}),
          }),
        });

      try {
        let res = await doPatch(false);
        if (res.status === 409) {
          const body = await res.clone().json().catch(() => ({}));
          // Si es solape, preguntamos al barbero antes de rechazar (Booksy/
          // GCal-style). Si dice sí, reintentamos con allowOverlap=true.
          if (body?.code === 'overlap') {
            const ok = await confirm({
              title: 'Esta cita se solapa con otra',
              message: 'Ya hay una reserva en ese hueco. ¿Mueves la cita igualmente?',
              confirmLabel: 'Mover igual',
              cancelLabel: 'Cancelar',
            });
            if (ok) {
              res = await doPatch(true);
            } else {
              setMoveError(null);
              await refetch();
              return;
            }
          }
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setMoveError(body?.error || 'No se pudo mover la cita.');
        }
      } catch {
        setMoveError('Sin conexión. La cita no se movió.');
      } finally {
        // 3) Revalidar SIEMPRE: si el PATCH falló, esto deshace el
        // optimismo volviendo a la verdad del servidor.
        await refetch();
      }
    },
    [events, barbers, refetch, confirm],
  );

  // Resize de una cita por drag de bordes (U1). Optimista: pintamos
  // duration/time YA en SWR, luego PATCH, luego revalidate. Si el server
  // responde 409 por solape, ofrecemos forzar (mismo flow que move).
  const handleEventResize = useCallback(
    async (id: string, next: { time: string; duration: number }) => {
      const current = events.find((e) => e.id === id);
      if (!current) return;
      // No-op si nada cambia (delta=0). Defensa en profundidad — DayGrid
      // ya filtra esto en el mouseUp, pero un doble disparo no rompería.
      if (current.time === next.time && current.duration === next.duration) {
        return;
      }
      setMoveError(null);

      await refetch(
        (prev) => {
          const safe = prev ?? EMPTY_PAYLOAD;
          return {
            events: safe.events.map((e) =>
              e.id === id ? { ...e, time: next.time, duration: next.duration } : e,
            ),
            blocks: safe.blocks,
          };
        },
        { revalidate: false },
      );

      const doPatch = (allowOverlap: boolean) =>
        fetch(`/api/bookings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            time: next.time,
            duration: next.duration,
            ...(allowOverlap ? { allowOverlap: true } : {}),
          }),
        });

      try {
        let res = await doPatch(false);
        if (res.status === 409) {
          const body = await res.clone().json().catch(() => ({}));
          if (body?.code === 'overlap') {
            const ok = await confirm({
              title: 'La cita se solapa con otra',
              message: 'La nueva duración pisa otra reserva. ¿Cambiar igualmente?',
              confirmLabel: 'Cambiar igual',
              cancelLabel: 'Cancelar',
            });
            if (ok) {
              res = await doPatch(true);
            } else {
              setMoveError(null);
              await refetch();
              return;
            }
          }
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setMoveError(body?.error || 'No se pudo cambiar la duración.');
        }
      } catch {
        setMoveError('Sin conexión. La duración no se cambió.');
      } finally {
        await refetch();
      }
    },
    [events, refetch, confirm],
  );

  // Resize de un descanso/ausencia parcial (U1). Endpoint distinto
  // (/api/barbers/[id]/blocks?blockId=) pero misma forma: optimista +
  // PATCH + revalidate. No hay flujo de "force overlap" — los bloqueos
  // del barbero no chocan entre sí en este endpoint (validar choque
  // con citas es trabajo de availability.ts al CREAR la cita, no aquí).
  const handleBlockResize = useCallback(
    async (block: CalendarBlock, next: { startTime: string; endTime: string }) => {
      if (block.startTime === next.startTime && block.endTime === next.endTime) {
        return;
      }
      setMoveError(null);

      await refetch(
        (prev) => {
          const safe = prev ?? EMPTY_PAYLOAD;
          return {
            events: safe.events,
            blocks: safe.blocks.map((b) =>
              b.id === block.id
                ? { ...b, startTime: next.startTime, endTime: next.endTime }
                : b,
            ),
          };
        },
        { revalidate: false },
      );

      try {
        const res = await fetch(
          `/api/barbers/${block.barberId}/blocks?blockId=${block.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              startTime: next.startTime,
              endTime: next.endTime,
            }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setMoveError(body?.error || 'No se pudo cambiar el bloqueo.');
        }
      } catch {
        setMoveError('Sin conexión. El bloqueo no se cambió.');
      } finally {
        await refetch();
      }
    },
    [refetch],
  );

  // Drag&drop de un descanso/ausencia (feedback Reni V1 P3: "cualquier
  // bloque en la agenda se tiene que poder mover con el mouse"). Mismo
  // patrón que move de cita pero PATCH a /api/barbers/[id]/blocks. Para
  // día-libre completo el rango llega null y solo cambian date/barberId
  // (DayGrid garantiza esa shape). Optimista en `payload.blocks`. Los
  // bloqueos del barbero no chocan entre sí en este endpoint — sin flow
  // de force-overlap. Si el barberId destino cambia, el endpoint verifica
  // ownership y devuelve 404 (revalidate revierte el optimismo).
  const handleBlockMove = useCallback(
    async (
      block: CalendarBlock,
      next: {
        date: string;
        startTime: string | null;
        endTime: string | null;
        barberId: string;
      },
    ) => {
      // No-op si nada cambia.
      if (
        block.date === next.date &&
        block.startTime === next.startTime &&
        block.endTime === next.endTime &&
        block.barberId === next.barberId
      ) {
        return;
      }
      setMoveError(null);

      // 1) Optimista en SWR — sólo mutamos blocks (events intactos).
      await refetch(
        (prev) => {
          const safe = prev ?? EMPTY_PAYLOAD;
          return {
            events: safe.events,
            blocks: safe.blocks.map((b) =>
              b.id === block.id
                ? {
                    ...b,
                    date: next.date,
                    startTime: next.startTime,
                    endTime: next.endTime,
                    barberId: next.barberId,
                  }
                : b,
            ),
          };
        },
        { revalidate: false },
      );

      // 2) PATCH al endpoint del barbero ORIGINAL (URL lleva su id; el
      // endpoint valida que el block le pertenece y, si barberId cambia
      // en el body, mueve la propiedad). Solo mandamos los campos que
      // realmente cambian — el endpoint hace patch incremental.
      const patch: {
        date?: string;
        startTime?: string;
        endTime?: string;
        barberId?: string;
      } = {};
      if (block.date !== next.date) patch.date = next.date;
      if (block.barberId !== next.barberId) patch.barberId = next.barberId;
      if (
        next.startTime !== null &&
        next.endTime !== null &&
        (block.startTime !== next.startTime || block.endTime !== next.endTime)
      ) {
        patch.startTime = next.startTime;
        patch.endTime = next.endTime;
      }

      try {
        const res = await fetch(
          `/api/barbers/${block.barberId}/blocks?blockId=${block.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setMoveError(body?.error || 'No se pudo mover el bloqueo.');
        }
      } catch {
        setMoveError('Sin conexión. El bloqueo no se movió.');
      } finally {
        // 3) Revalidar SIEMPRE — si el PATCH falló, esto devuelve el
        // block a su sitio (rollback del optimismo).
        await refetch();
      }
    },
    [refetch],
  );

  const handleEventClick = (event: CalendarEvent) => {
    setIsNewBookingOpen(false);
    setSelectedBookingId(event.id);
  };

  // Derive el booking actual de la query SWR. Cada `refetch()` actualiza
  // este objeto sin tocar `selectedBookingId` — el panel re-renderiza con
  // datos frescos. Si el id deja de existir (cancelled+filtrado, movido
  // fuera del rango, eliminado) cerramos el drawer automáticamente.
  const selectedBooking: CalendarEvent | null = useMemo(() => {
    if (!selectedBookingId) return null;
    return events.find((e) => e.id === selectedBookingId) ?? null;
  }, [events, selectedBookingId]);

  useEffect(() => {
    // Auto-close cuando el booking abierto desaparece tras un refetch
    // (booking borrado o movido fuera del rango visible). Sin esto el
    // drawer se quedaría abierto pintando un esqueleto vacío.
    if (selectedBookingId && !loading && !selectedBooking) {
      setSelectedBookingId(null);
    }
  }, [selectedBookingId, selectedBooking, loading]);

  const VIEW_LABELS: Record<'day' | 'week' | 'month', string> = {
    day: 'Día',
    week: 'Semana',
    month: 'Mes',
  };

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Controls bar — SIN título: la cabecera del área (page.tsx) ya
          pinta "Agenda" + las pestañas (AreaTabs). Antes había un
          <h1>Calendario</h1> aquí → título doblado y término divergente
          (G1/N2). Esto es sólo la barra de controles del calendario.
          En `mobileMode` la barra se compacta: sin rail toggle, sin
          Day/Week/Month, sin Importar/Promos — solo navegación de día +
          FAB de Nueva cita al fondo. */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-surface flex-wrap shrink-0">
        {/* Rail toggle — solo en Día/Semana y NO en modo móvil */}
        {!mobileMode && viewMode !== 'month' && (
          <button
            onClick={toggleRail}
            className="p-1.5 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors"
            title={railCollapsed ? 'Mostrar panel' : 'Ocultar panel'}
            aria-label={railCollapsed ? 'Mostrar panel' : 'Ocultar panel'}
          >
            {railCollapsed
              ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            }
          </button>
        )}
        {/* Today */}
        <button
          onClick={handleTodayClick}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-overlay border border-line text-ink-2 hover:bg-canvas transition-colors"
        >
          Hoy
        </button>

        {/* Prev / Range / Next */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-ink-2 min-w-[160px] text-center capitalize">
            {rangeLabel()}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg hover:bg-overlay text-ink-2 hover:text-ink transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day / Week / Month toggle — oculto en mobileMode (siempre Día) */}
        {!mobileMode && (
          <div className="flex rounded-lg bg-overlay border border-line p-0.5">
            {(['day', 'week', 'month'] as const).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === m
                    ? 'bg-surface shadow-sm text-ink'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {VIEW_LABELS[m]}
              </button>
            ))}
          </div>
        )}

        {/* Task #102 v2 — control multi-select de visibilidad de barberos.
            Estándar Google Calendar / Booksy: a la vista en el header,
            cada barbero on/off vía checkbox en un popover.
            NO se muestra cuando:
              · `barberFilterId` está server-forzado (/yo/agenda — el
                barbero ya está acotado a su scope)
              · el equipo tiene 1 solo barbero (autónomo): toggle inútil
                porque siempre habría 1 columna; el control sería ruido.
            Si en el futuro un autónomo añade un segundo barbero, el
            control aparece automáticamente sin tocar nada. */}
        {!barberFilterId && barbers.length > 1 && (
          <BarberVisibilityControl
            barbers={barbers}
            selectedIds={selectedBarberIds}
            onChange={setVisibleBarberIds}
          />
        )}

        {/* Promos + import + new booking — Importar y Promos son admin-only
            (operación de tienda, no del barbero); ocultos en mobileMode. */}
        {!mobileMode && promosEnabled && (
          <button
            type="button"
            onClick={() => setIsPromosOpen(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-brand/40 hover:border-brand text-brand-strong hover:bg-brand-softer transition-colors"
            title="Avisar a clientes habituales para llenar huecos"
          >
            <Megaphone className="h-3.5 w-3.5" />
            Llenar huecos
          </button>
        )}
        {!mobileMode && (
          <a
            href="/dashboard/agenda/importar"
            className={`${promosEnabled ? '' : 'ml-auto'} flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-line hover:border-line-strong text-ink-2 hover:text-ink transition-colors`}
            title="Importar reservas desde Booksy / agenda externa"
          >
            Importar
          </a>
        )}
        {/* "Nueva cita": botón normal en admin; en mobileMode el botón
            se renderiza FUERA de la barra (FAB flotante abajo a la derecha,
            ver al final del JSX). Aquí lo omitimos. Pre-rellenamos el slot
            con el barbero filtrado en móvil para que NewBookingPanel ya
            traiga seleccionado al barbero correcto. */}
        {!mobileMode && (
          <button
            onClick={() => {
              setNewBookingSlot({ date: format(new Date(), 'yyyy-MM-dd'), time: '10:00', barberId: effectiveBarberFilterId });
              setSelectedBookingId(null);
              setIsNewBookingOpen(true);
            }}
            className={`${promosEnabled ? '' : 'ml-auto'} flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand hover:bg-brand-strong text-brand-ink transition-colors`}
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva cita
          </button>
        )}

        {/* Loading indicator */}
        {loading && <Loader2 className="h-4 w-4 text-ink-3 animate-spin" />}
      </div>

      {/* Error de movimiento (drag&drop / mover manual). El revalidate de
          SWR ya devolvió la cita a su sitio; esto solo explica por qué. */}
      {moveError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-4 py-2 bg-danger/10 border-b border-danger/30 text-danger text-xs font-medium shrink-0"
        >
          <span>{moveError}</span>
          <button
            type="button"
            onClick={() => setMoveError(null)}
            className="text-danger/70 hover:text-danger"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Cuerpo: rail izquierdo (nav firma de Booksy) + rejilla. El rail
          solo en Día/Semana — Mes YA es un calendario, un mini-mes al lado
          sería redundante. La leyenda de equipo y el filtro de barbero
          viven ahora DENTRO del rail (fuente única, no duplicar). */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Rail: oculto en mobileMode (es admin-tooling — picker de fecha
            calendario+selector de barbero; el barbero móvil solo opera su
            columna y navega día con prev/next o Hoy). */}
        {!mobileMode && viewMode !== 'month' && !railCollapsed && (
          <>
            {/* Scrim sólo en mobile (<md). Cierra el drawer al tocar fuera.
                <button> en lugar de <div onClick> para accesibilidad teclado
                + role implícito + AAA tap target en el wrapper completo. */}
            <button
              type="button"
              onClick={toggleRail}
              aria-label="Cerrar panel lateral"
              className="fixed inset-0 z-40 bg-[var(--color-scrim-light)] md:hidden cursor-default"
            />
            {/* Wrapper del rail: drawer fixed entre top-bar y bottom-nav del
                shell mobile; `md:static` lo reintegra al flex layout desktop.
                `md:shrink-0` preserva los 240px del aside hijo. Sombra solo
                en mobile (drawer); en desktop el border-r del rail ya separa.
                Tokens del shell en globals.css — la altura del top-bar y
                el respeto del notch viven allí, no aquí. */}
            <div
              className="fixed left-0 z-50 md:static md:z-auto md:shrink-0 shadow-2xl md:shadow-none md:top-auto md:bottom-auto"
              style={{
                top: 'var(--mobile-topbar-offset)',
                // Antes anclaba al bottom-nav; ahora ese nav ya no existe
                // (toda nav móvil vive en el drawer del burger). El drawer
                // sólo respeta el home-indicator del iPhone.
                bottom: 'var(--safe-bottom)',
              }}
            >
              <AgendaSideRail
                currentDay={currentDay}
                onSelectDate={(d) => {
                  setCurrentDay(d);
                  // Auto-cierre del drawer en mobile al elegir fecha/barbero
                  // — patrón estándar (Booksy, GCal mobile): la acción se
                  // cumplió, el barbero quiere volver a la agenda inmediatamente.
                  if (isMobileViewport()) setRailCollapsed(true);
                }}
                barbers={barbers}
                selectedBarber={selectedBarber}
                onSelectBarber={(id) => {
                  setSelectedBarber(id);
                  if (isMobileViewport()) setRailCollapsed(true);
                }}
              />
            </div>
          </>
        )}

        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {viewMode === 'day' ? (
            <DayGrid
              date={currentDay}
              events={events}
              blocks={blocks}
              barbers={visibleBarbers}
              services={services}
              blockedDates={blockedDates}
              hours={hours}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
              onBarberClick={(b) => {
                setSelectedBookingId(null);
                setSlotMenu(null);
                setBarberMenu(b);
              }}
              onBlockClick={async (block) => {
                // Por ahora: confirm sencillo "¿Eliminar este descanso?".
                // Edit-in-place requiere refactor del BlockModal a modo
                // dual (new|edit); siguiente iteración. Mientras tanto el
                // barbero puede borrar y recrear sin quedarse atrapado en
                // la modal de "nueva cita" como pasaba antes.
                const label =
                  block.kind === 'absence'
                    ? (!block.startTime && !block.endTime ? 'día libre' : 'ausencia')
                    : 'descanso';
                const range =
                  block.startTime && block.endTime
                    ? ` (${block.startTime}–${block.endTime})`
                    : '';
                const ok = await confirm({
                  title: `Eliminar ${label}`,
                  message: `Vas a quitar este ${label}${range}. ¿Seguro?`,
                  confirmLabel: 'Eliminar',
                  cancelLabel: 'Cancelar',
                  variant: 'danger',
                });
                if (!ok) return;
                const res = await fetch(
                  `/api/barbers/${block.barberId}/blocks?blockId=${block.id}`,
                  { method: 'DELETE' },
                );
                if (res.ok) {
                  refetch();
                } else {
                  setMoveError('No se pudo eliminar el descanso.');
                }
              }}
              onEventMove={handleEventMove}
              onEventResize={handleEventResize}
              onBlockResize={handleBlockResize}
              onBlockMove={handleBlockMove}
            />
          ) : viewMode === 'week' ? (
            <WeekGrid
              weekStart={startOfWeek(currentDay, { weekStartsOn: 1 })}
              events={events}
              barbers={visibleBarbers}
              services={services}
              blockedDates={blockedDates}
              onEventClick={handleEventClick}
              onSelectDay={(d) => {
                // Click en la cabecera de un día → vista Día centrada.
                // Reutiliza los mismos setters que el toggle Día/Semana/Mes
                // y el botón "Hoy" (fuente única, DRY).
                setCurrentDay(d);
                setViewMode('day');
              }}
              onShowAllDay={(d, barber) => {
                // Click en "Mostrar todo (X) ›" en una celda → vista Día
                // centrada en ese día Y filtrada por ese barbero. Reusa el
                // estado `selectedBarber` (filtro por NOMBRE que ya consume
                // /api/dashboard/calendar) en vez de añadir un segundo eje
                // de estado — DRY con el filtro del rail lateral.
                //
                // `barber === null` viene de la swimlane "Sin asignar":
                // no aplicamos filtro (mostramos TODAS las citas del día,
                // para ver las huérfanas en el timeline real).
                setCurrentDay(d);
                setSelectedBarber(barber ? barber.name : 'all');
                setViewMode('day');
              }}
              onCellClick={(date, barberId) => {
                // Click en celda vacía → "Nueva cita" prefijada al
                // barbero+día de la celda. Misma rampa que `handleSlotAction`
                // sin pasar por el menú contextual (las celdas de Semana ya
                // son específicas — no hay duda de qué barbero).
                setNewBookingSlot({ date, time: '10:00', barberId });
                setSelectedBookingId(null);
                setIsNewBookingOpen(true);
              }}
            />
          ) : (
            <MonthGrid
              monthStart={startOfMonth(currentDay)}
              events={events}
              services={services}
              blockedDates={blockedDates}
              onEventClick={handleEventClick}
              onSlotClick={handleSlotClick}
            />
          )}
        </div>
      </div>

      {/* Detail panel — `booking` se DERIVA de la query SWR (no es un
          snapshot). `onMutated` revalida la lista tras cualquier acción
          dentro del drawer (no-show, editar servicio, marcar origen,
          añadir producto…) y el panel se re-renderiza con datos frescos
          sin necesidad de cerrar/reabrir. */}
      <BookingDetailPanel
        booking={selectedBooking}
        onClose={() => setSelectedBookingId(null)}
        stripeConnectStatus={stripeConnectStatus}
        cashRegisterEnabled={cashRegisterEnabled}
        sumupReaderConnected={sumupReaderConnected}
        barbers={barbers}
        services={services}
        hours={hours}
        onMutated={() => refetch()}
      />

      {/* Promos modal — solo se renderiza si está activado en /dashboard/app */}
      {promosEnabled && (
        <PromosFillModal
          isOpen={isPromosOpen}
          onClose={() => setIsPromosOpen(false)}
        />
      )}

      {/* Menú contextual de slot (A7) — chooser sobre la agenda atenuada */}
      <SlotActionMenu
        open={slotMenu !== null}
        slot={slotMenu}
        contextLabel={slotMenuLabel}
        onClose={() => setSlotMenu(null)}
        onAction={handleSlotAction}
      />

      {/* K1 — Bloqueo/ausencia desde el slot context-menu. MISMOS modales
          que BarberActionMenu (Equipo>Turnos, mismo endpoint
          /api/barbers/[id]/blocks). modalBarber: shape mínimo que
          Block/AbsenceModal leen (id+name+photoUrl; hours/breaks/blocks
          no se usan al crear — verificado en BarberActionMenu). */}
      {slotBlock && slotBlock.kind === 'unavailability' && (
        <BlockModal
          barber={{
            id: slotBlock.barber.id,
            name: slotBlock.barber.name,
            photoUrl: slotBlock.barber.photoUrl,
            hours: null,
            breaks: [],
            blocks: [],
          }}
          defaultDate={slotBlock.date}
          defaultStart={slotBlock.time}
          onClose={() => setSlotBlock(null)}
          onSaved={() => {
            setSlotBlock(null);
            refetch();
          }}
        />
      )}
      {slotBlock && slotBlock.kind === 'absence' && (
        <AbsenceModal
          barber={{
            id: slotBlock.barber.id,
            name: slotBlock.barber.name,
            photoUrl: slotBlock.barber.photoUrl,
            hours: null,
            breaks: [],
            blocks: [],
          }}
          defaultDate={slotBlock.date}
          onClose={() => setSlotBlock(null)}
          onSaved={() => {
            setSlotBlock(null);
            refetch();
          }}
        />
      )}

      {/* Menú de acciones del barbero (fix #2) — clic en su cabecera de
          columna. Reusa AbsenceModal/BlockModal y los eventos ya cargados.
          El toggle "ver solo a X" vivía aquí en task #102 v1; en v2 se
          movió al control multi-select del header (BarberVisibilityControl).
          Este sheet vuelve a ser exclusivamente para editar (horario,
          ausencia, descanso). */}
      <BarberActionMenu
        barber={barberMenu}
        events={events}
        dateStr={format(currentDay, 'yyyy-MM-dd')}
        onClose={() => setBarberMenu(null)}
        onChanged={() => refetch()}
      />

      {/* New booking panel */}
      <NewBookingPanel
        isOpen={isNewBookingOpen}
        initialDate={newBookingSlot.date}
        initialTime={newBookingSlot.time}
        initialBarberId={newBookingSlot.barberId}
        services={services}
        barbers={barbers}
        onClose={() => setIsNewBookingOpen(false)}
        onCreated={() => {
          refetch();
        }}
      />

      {/* FAB "Nueva cita" — solo móvil. Vive fuera del header para no
          robar espacio horizontal en pantallas ≤360px. Posicionado
          encima del BottomNav del shell (`/yo/(app)/layout.tsx` reserva
          72px + safe-area). Pre-rellena el barbero filtrado para que el
          panel ya traiga su nombre seleccionado. */}
      {mobileMode && (
        <button
          type="button"
          onClick={() => {
            setNewBookingSlot({
              date: format(currentDay, 'yyyy-MM-dd'),
              time: format(new Date(), 'HH:mm'),
              barberId: effectiveBarberFilterId,
            });
            setSelectedBookingId(null);
            setIsNewBookingOpen(true);
          }}
          aria-label="Nueva cita"
          className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg transition-transform active:scale-95"
          style={{ bottom: 'calc(72px + env(safe-area-inset-bottom) + 16px)' }}
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
