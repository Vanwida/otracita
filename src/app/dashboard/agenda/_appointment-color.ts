import { Check, CheckCheck, Clock, X as XIcon, AlertTriangle, CheckCircle2, UserX, CalendarX2, type LucideIcon } from 'lucide-react';
import {
  type ServiceColorToken,
  DEFAULT_SERVICE_COLOR,
  isServiceColorToken,
  isCustomHex,
  SERVICE_COLOR_CLASSES,
  pickTextColorFor,
} from '@/lib/service-colors';

// -----------------------------------------------------------------------------
// FUENTE ÚNICA del color de una cita en la agenda (DESIGN.md §"Booking card"
// + fix #6, paridad Booksy-exact). Antes el bloque se tintaba por BARBERO y el
// estado solo modulaba opacidad — no es lo que hace Booksy y costaba leer "qué
// citas están sin confirmar / no vinieron" de un vistazo.
//
// Regla única ahora (igual que Booksy, idéntica en Día/Semana/Mes):
//   · El COLOR del bloque comunica el ESTADO de la cita:
//       confirmada    → verde  (--color-event-confirmed-* / --color-success)
//       sin confirmar → rojo suave (--color-danger sobre surface)
//       hecha         → slate  (--color-event-completed-*)
//       no vino       → MORADO (--color-event-native, hue 292) — Booksy
//                       pinta la inasistencia en morado, no en rojo. El
//                       token "-noshow" es rojo (hue 29): NO lo usamos aquí,
//                       honramos la intención visual de Booksy.
//       cancelada     → gris atenuado + tachado (--color-line-strong)
//   · El estado SIEMPRE se refuerza además con ÍCONO + ETIQUETA
//     (`statusBadge`) — el color NUNCA es la única señal (AAA, DESIGN.md
//     "Color como única señal de estado" prohibido).
//   · La identidad del BARBERO NO va en el bloque: vive en el acento de la
//     cabecera de columna (avatar + franja `barberColorVar`, ver DayGrid).
//
// Todas las rejillas (DayGrid/WeekGrid/MonthGrid) consumen este módulo —
// cero lógica de color duplicada. `displayOrder` se mantiene en la firma por
// compatibilidad de llamadas pero ya NO decide el color (lo hace el estado).
// -----------------------------------------------------------------------------

export type AppointmentStatus =
  | 'confirmed'
  | 'pending'
  | 'completed'
  | 'no_show'
  | 'cancelled';

/** Normaliza cualquier string de estado a uno de los 5 canónicos. `pending`
 *  ("sin confirmar") es su propio estado — antes colapsaba en `confirmed`. */
export function normalizeStatus(status: string): AppointmentStatus {
  if (
    status === 'pending' ||
    status === 'completed' ||
    status === 'no_show' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'confirmed';
}

// Identidad del barbero (avatar + franja de color) NO vive aquí: la pinta
// DayGrid directamente con `barberColorVar` (de ./types) en la cabecera de
// columna. Este módulo es solo color POR ESTADO.

/** Tokens de fondo/tinta por estado — fuente única del color de cita.
 *  Fills SATURADOS con texto warm-near-white (Booksy-bold), sobre el
 *  cream del canvas respiran. Antes eran tints al 14% sobre surface →
 *  todo se confundía en pastel. AA verificado en cada combinación.
 *  La identidad del barbero NO va aquí: vive en la cabecera de columna. */
function statusColors(s: AppointmentStatus): {
  bg: string;
  ink: string;
  /** Borde 1px del bloque (variante más oscura del bg para crear hairline
   *  perimetral — patrón Stitch). El bloque sin borde se ve "flat IA"; con
   *  esta línea sutil gana profundidad sin ruido. */
  border: string;
} {
  // Warm-near-white: tono cálido del sistema (no oklch puro) para que el
  // texto sobre fondos saturados no se sienta plástico.
  const NEAR_WHITE = 'oklch(0.98 0.005 60)';
  switch (s) {
    case 'pending':
      // Sin confirmar: rojo confiado, texto claro. Booksy resalta lo
      // no-confirmado en rojo — atención inmediata.
      return {
        bg: 'color-mix(in oklab, var(--color-danger), black 8%)',
        ink: NEAR_WHITE,
        border: 'color-mix(in oklab, var(--color-danger), black 22%)',
      };
    case 'completed':
      // Hecha: slate frío oscuro. Estado archival, presente pero quieto.
      return {
        bg: 'color-mix(in oklab, var(--color-ink-2), black 8%)',
        ink: NEAR_WHITE,
        border: 'color-mix(in oklab, var(--color-ink-2), black 22%)',
      };
    case 'no_show':
      // No vino: morado (event-native). Inasistencia ≠ pending.
      return {
        bg: 'color-mix(in oklab, var(--color-event-native), black 6%)',
        ink: NEAR_WHITE,
        border: 'color-mix(in oklab, var(--color-event-native), black 20%)',
      };
    case 'cancelled':
      // Cancelada: atenuada, texto oscuro con line-through (treatment).
      // No compite con activas pero sigue legible.
      return {
        bg: 'var(--color-event-cancelled-bg)',
        ink: 'var(--color-event-cancelled-ink)',
        border: 'var(--color-line-strong)',
      };
    default:
      // Confirmada: verde sage saturado.
      return {
        bg: 'color-mix(in oklab, var(--color-success), black 10%)',
        ink: NEAR_WHITE,
        border: 'color-mix(in oklab, var(--color-success), black 24%)',
      };
  }
}

/**
 * Estilo inline del bloque de cita (Día/Semana). El RELLENO saturado
 * comunica el ESTADO; el texto warm-near-white se compone encima. SIN
 * borde-izq 4px (banned en DESIGN.md + redundante con el fill).
 * `displayOrder` se ignora — la identidad del barbero vive en la cabecera.
 */
export function appointmentBlockStyle(
  _displayOrder: number | null | undefined,
  status: string,
): {
  style: React.CSSProperties;
  /** Clases de tratamiento (tachado/atenuado) — el color va en `style`. */
  treatment: string;
} {
  const s = normalizeStatus(status);
  const { bg, ink, border } = statusColors(s);
  return {
    style: {
      backgroundColor: bg,
      color: ink,
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: border,
    },
    treatment: s === 'cancelled' ? 'line-through opacity-90' : '',
  };
}

/**
 * Variante "chip" para la rejilla de Mes (una línea, denso). Mismo fill
 * saturado que el bloque, sin texturas extra (1-line no aguanta capas).
 */
export function appointmentChipStyle(
  _displayOrder: number | null | undefined,
  status: string,
): { style: React.CSSProperties; treatment: string } {
  const s = normalizeStatus(status);
  const { bg, ink } = statusColors(s);
  return {
    style: {
      backgroundColor: bg,
      color: ink,
    },
    treatment: s === 'cancelled' ? 'line-through opacity-90' : '',
  };
}

/** Ícono + etiqueta del estado — fuente única (icon + texto = AAA, el color
 *  NUNCA es la única señal). Devuelve SIEMPRE (también para confirmada): así
 *  cada tile puede mostrar su estado de forma explícita y la leyenda deriva
 *  100% de aquí sin entradas a mano. */
export function statusBadge(
  status: string,
): { icon: LucideIcon; label: string; tone: string } {
  switch (normalizeStatus(status)) {
    case 'pending':
      return { icon: AlertTriangle, label: 'Sin confirmar', tone: 'text-danger' };
    case 'completed':
      return { icon: CheckCircle2, label: 'Hecha', tone: 'text-success' };
    case 'no_show':
      // Morado (Booksy), igual que el relleno del bloque.
      return { icon: UserX, label: 'No vino', tone: 'text-event-native' };
    case 'cancelled':
      return { icon: CalendarX2, label: 'Cancelada', tone: 'text-ink-3' };
    default:
      // Confirmada — estado por defecto. Antes devolvía null; ahora también
      // tiene badge para que el estado sea siempre explícito (Booksy).
      return { icon: CheckCircle2, label: 'Confirmada', tone: 'text-success' };
  }
}

// -----------------------------------------------------------------------------
// #33 — Color del bloque por SERVICIO, no por estado.
//
// El barbero asigna un `colorToken` a cada servicio: o uno de los 12 colores
// saturados de la paleta (red/orange/.../slate) o un hex `#RRGGBB`
// personalizado vía `<input type="color">`. El bloque de cita se rellena con
// ese color y el texto se calcula por luminancia (light/dark). El ESTADO se
// comunica con un badge en la esquina sup-der (icono + tono), no con el
// fondo del bloque. La cancelación se trata aparte: opacity + line-through
// sobre el color del servicio (no devolvemos color "gris cancelada", la
// cancelación atenúa lo que ya estaba).
//
// `appointmentBlockStyle` / `appointmentChipStyle` siguen aquí porque
// AgendaSideRail los usa para pintar la leyenda de ESTADO (panel lateral).
// Para el render del bloque en Día/Semana/Mes los grids consumen
// `appointmentBlockClasses` / `appointmentChipClasses` — que devuelven
// `className` para tokens canónicos o `style` inline para hex custom.
// -----------------------------------------------------------------------------

/** Servicio configurado mínimo necesario para resolver color. Usa solo
 *  `name` (clave de match con la cita) y `colorToken` (puede no existir
 *  o venir inválido — el jsonb no tiene schema). */
export interface ServiceWithColor {
  name: string;
  colorToken?: string | null;
}

/** Valor de color de un servicio: o bien un token de la paleta canónica
 *  (12 colores) o bien un hex `#RRGGBB` custom elegido por el barbero. */
export type ServiceColorValue = ServiceColorToken | string;

/** Resuelve el color de un servicio para una cita a partir del catálogo de
 *  servicios del cliente. Si el servicio no se encuentra o no tiene
 *  `colorToken` válido (ni token canónico ni hex), devuelve el por defecto. */
export function resolveBookingColorToken(
  booking: { service: string },
  services: ReadonlyArray<ServiceWithColor>,
): ServiceColorValue {
  const match = services.find((s) => s.name === booking.service);
  const raw = match?.colorToken;
  if (typeof raw === 'string') {
    if (isServiceColorToken(raw)) return raw;
    if (isCustomHex(raw)) return raw.toLowerCase();
  }
  return DEFAULT_SERVICE_COLOR;
}

/** Resultado del render de un bloque/chip de cita. Para tokens de la paleta
 *  devolvemos `className` (utilities Tailwind). Para hex custom devolvemos
 *  `style` inline (no podemos generar utilities dinámicas en build). El
 *  consumidor mergea ambos: el caso normal solo usa `className`, el caso
 *  custom solo usa `style`. `treatment` (line-through cancelled) es común. */
export interface AppointmentColorRender {
  /** Clases Tailwind del color (vacío si el color es custom hex). */
  className: string;
  /** Style inline para hex custom (undefined si el color es token). */
  style?: React.CSSProperties;
  /** Tratamiento del texto: 'line-through' para canceladas. */
  treatment: string;
}

/** Render del bloque (Día/Semana) o chip (Mes). Una sola función para ambos
 *  — la única diferencia entre vistas era la lógica de color y la queremos
 *  unificada (un chip de mes es solo una versión densa del mismo color). */
export function appointmentBlockClasses(
  value: ServiceColorValue,
  status: string,
): AppointmentColorRender {
  const isCancelled = normalizeStatus(status) === 'cancelled';
  const treatment = isCancelled ? 'line-through' : '';
  const dim = isCancelled ? 'opacity-60' : '';

  // Custom hex — style inline, sin clases de color (Tailwind no genera
  // utilities dinámicas). El texto se calcula por luminancia.
  if (isCustomHex(value)) {
    const textLD = pickTextColorFor(value);
    const textColor =
      textLD === 'light'
        ? 'var(--color-on-svc-light)'
        : 'var(--color-on-svc-dark)';
    return {
      className: dim.trim(),
      style: {
        backgroundColor: value,
        color: textColor,
        // Hairline interno del mismo color (24% más oscuro/claro vía
        // color-mix) para profundidad sutil — equivalente al ring que se
        // usa para tokens.
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${value}, ${
          textLD === 'light' ? 'black' : 'white'
        } 24%)`,
      },
      treatment,
    };
  }

  // Token canónico — clases utility de la paleta.
  const token = isServiceColorToken(value) ? value : DEFAULT_SERVICE_COLOR;
  const c = SERVICE_COLOR_CLASSES[token];
  // ring-inset + ring del color del servicio al 30% → hairline que NO compite
  // con el contenido pero da profundidad y unifica con el bg. Tailwind v4
  // acepta `ring-svc-X/30` como utility válida.
  const ring = `ring-1 ring-inset ${c.ring}/30`;
  return {
    className: `${c.bg} ${c.ink} ${ring} ${dim}`.trim(),
    treatment,
  };
}

/** Variante "chip" del mes — alias de `appointmentBlockClasses`. */
export function appointmentChipClasses(
  value: ServiceColorValue,
  status: string,
): AppointmentColorRender {
  return appointmentBlockClasses(value, status);
}

/** Badge de estado para la esquina sup-der del bloque. Iconos distintos a
 *  los de `statusBadge` (que vive en la leyenda lateral): aquí priorizamos
 *  glifos cortos y reconocibles a tamaño chico (16-20px). */
export function statusCornerBadge(
  status: string,
): { icon: LucideIcon; label: string; tone: string } {
  switch (normalizeStatus(status)) {
    case 'pending':
      return { icon: Clock, label: 'Sin confirmar', tone: 'text-ink-3' };
    case 'completed':
      return { icon: CheckCheck, label: 'Hecha', tone: 'text-success' };
    case 'no_show':
      return { icon: AlertTriangle, label: 'No vino', tone: 'text-danger' };
    case 'cancelled':
      return { icon: XIcon, label: 'Cancelada', tone: 'text-danger' };
    default:
      return { icon: Check, label: 'Confirmada', tone: 'text-success' };
  }
}

/** Una entrada de la leyenda: ícono+etiqueta+tono de `statusBadge` MÁS la
 *  muestra de color (fondo) EXACTA del bloque, derivada de la MISMA
 *  `statusColors` que pinta el calendario. No hay segunda paleta. */
export interface StatusLegendItem {
  icon: LucideIcon;
  label: string;
  tone: string;
  /** Fill del bloque para este estado (idéntico a `appointmentBlockStyle`). */
  swatchBg: string;
  /** Color del texto sobre swatchBg (para que la muestra incluya un
   *  pequeño glyph/check legible, no quede como tarjeta vacía). */
  swatchInk: string;
}

/** Construye una fila de leyenda combinando `statusBadge` (icon/label/tone)
 *  con `statusColors` (bg/ink). El color de la muestra ES, byte a byte,
 *  el color con que se pinta ese estado en Día/Semana/Mes. */
function legendItem(status: AppointmentStatus): StatusLegendItem {
  const badge = statusBadge(status);
  const { bg, ink } = statusColors(status);
  return { ...badge, swatchBg: bg, swatchInk: ink };
}

/**
 * Leyenda "Estado de la cita" — panel lateral del rail (paridad Booksy
 * 09.39.31), aplica a Día/Semana/Mes. DERIVA por completo de `statusBadge`
 * (ícono/etiqueta/tono) + `statusColors` (color de la muestra) — las MISMAS
 * fuentes que pintan cada tile — para que la leyenda NUNCA mienta: si
 * cambia el color, el ícono o la etiqueta de un estado, la leyenda cambia
 * con él. Antes la leyenda solo tenía ícono+etiqueta y "Confirmada"/"Hecha"
 * compartían el check verde sin comunicar que el bloque es verde vs slate.
 * Orden Booksy: confirmada → sin confirmar → hecha → no vino → cancelada. */
export const STATUS_LEGEND: ReadonlyArray<StatusLegendItem> = [
  legendItem('confirmed'),
  legendItem('pending'),
  legendItem('completed'),
  legendItem('no_show'),
  legendItem('cancelled'),
];
