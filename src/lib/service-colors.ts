// -----------------------------------------------------------------------------
// service-colors — catálogo cerrado de colores semánticos para servicios.
//
// El barbero elige uno de 21 tokens al crear/editar un servicio. El bloque de
// cita en la agenda (#33) usará el par {bg, ink} correspondiente para pintarse.
//
// Por qué tokens y no hex:
//  · Theme único — si mañana ajustamos la paleta (más cálida, más fría) un
//    cambio en globals.css mueve todos los bloques.
//  · Whitelist anti-input-injection — `chatbotServices` es jsonb sin schema
//    estricto, así que validamos en runtime que el token guardado pertenece
//    al set conocido.
//
// Por qué nombres abstractos (terracota/olive/sky) en vez de funcionales
// (corte/coloración/barba): los servicios varían por negocio. Imponer una
// taxonomía encajonaría al barbero. El nombre del color es decorativo.
//
// Los tokens viven en globals.css dentro de `@theme` como pares
// --color-svc-<name>-bg / --color-svc-<name>-ink. Tailwind v4 los expone como
// utilities (`bg-svc-terracota-bg`, `text-svc-terracota-ink`, etc.).
//
// Orden: el array está ordenado por hue (warms → cools → warms-magenta) para
// que el picker grid de #34 lea natural — el barbero recorre la paleta como
// un círculo cromático, no como una lista alfabética.
// -----------------------------------------------------------------------------

export const SERVICE_COLOR_TOKENS = [
  // Warms (hue 10-90)
  'blush',
  'brick',
  'coral',
  'terracota',
  'peach',
  'stone',
  'oat',
  'sand',
  'gold',
  'mustard',
  // Greens (hue 130-200)
  'olive',
  'sage',
  'jade',
  'teal',
  // Cools (hue 220-290)
  'sky',
  'fog',
  'slate',
  'denim',
  'lavender',
  // Magenta-warms (hue 320-340)
  'mauve',
  'plum',
] as const

export type ServiceColorToken = (typeof SERVICE_COLOR_TOKENS)[number]

/**
 * Color por defecto cuando un servicio no tiene `colorToken` (o es inválido).
 * Alineado con la brand (terracota = `--color-brand`).
 */
export const DEFAULT_SERVICE_COLOR: ServiceColorToken = 'terracota'

/**
 * Type guard. Útil para validar el campo entrante en el server action antes
 * de persistirlo en `chatbotServices` (jsonb sin schema, no podemos
 * confiar en el cliente).
 */
export function isServiceColorToken(v: unknown): v is ServiceColorToken {
  return typeof v === 'string' && (SERVICE_COLOR_TOKENS as readonly string[]).includes(v)
}

/**
 * Devuelve un token siempre válido. Si la entrada es inválida, devuelve el
 * por defecto. Conveniente en consumidores que necesitan algo que pintar
 * sí o sí (ej. agenda block coloring en #33).
 */
export function normalizeServiceColor(v: unknown): ServiceColorToken {
  return isServiceColorToken(v) ? v : DEFAULT_SERVICE_COLOR
}

/**
 * Mapa token → clases Tailwind. Cada entrada expone un par {bg, ink, border,
 * ring} listo para componer.
 *
 *  - bg     → relleno (tinte deslavado, lee sobre canvas blanco/bone)
 *  - ink    → texto y borde de acento (saturado, AA sobre `bg`)
 *  - border → borde sólido del acento (mismo hue que ink)
 *  - ring   → focus ring cuando el chip está seleccionado en el picker
 *
 * Los CSS vars detrás están declarados en `src/app/globals.css` (@theme).
 * Tailwind v4 los transforma en utilities automáticamente — no hay
 * arbitrary values con vars inline en el código UI.
 */
export const SERVICE_COLOR_CLASSES: Record<
  ServiceColorToken,
  { bg: string; ink: string; border: string; ring: string }
> = {
  blush: {
    bg: 'bg-svc-blush-bg',
    ink: 'text-svc-blush-ink',
    border: 'border-svc-blush-ink',
    ring: 'ring-svc-blush-ink',
  },
  brick: {
    bg: 'bg-svc-brick-bg',
    ink: 'text-svc-brick-ink',
    border: 'border-svc-brick-ink',
    ring: 'ring-svc-brick-ink',
  },
  coral: {
    bg: 'bg-svc-coral-bg',
    ink: 'text-svc-coral-ink',
    border: 'border-svc-coral-ink',
    ring: 'ring-svc-coral-ink',
  },
  terracota: {
    bg: 'bg-svc-terracota-bg',
    ink: 'text-svc-terracota-ink',
    border: 'border-svc-terracota-ink',
    ring: 'ring-svc-terracota-ink',
  },
  peach: {
    bg: 'bg-svc-peach-bg',
    ink: 'text-svc-peach-ink',
    border: 'border-svc-peach-ink',
    ring: 'ring-svc-peach-ink',
  },
  stone: {
    bg: 'bg-svc-stone-bg',
    ink: 'text-svc-stone-ink',
    border: 'border-svc-stone-ink',
    ring: 'ring-svc-stone-ink',
  },
  oat: {
    bg: 'bg-svc-oat-bg',
    ink: 'text-svc-oat-ink',
    border: 'border-svc-oat-ink',
    ring: 'ring-svc-oat-ink',
  },
  sand: {
    bg: 'bg-svc-sand-bg',
    ink: 'text-svc-sand-ink',
    border: 'border-svc-sand-ink',
    ring: 'ring-svc-sand-ink',
  },
  gold: {
    bg: 'bg-svc-gold-bg',
    ink: 'text-svc-gold-ink',
    border: 'border-svc-gold-ink',
    ring: 'ring-svc-gold-ink',
  },
  mustard: {
    bg: 'bg-svc-mustard-bg',
    ink: 'text-svc-mustard-ink',
    border: 'border-svc-mustard-ink',
    ring: 'ring-svc-mustard-ink',
  },
  olive: {
    bg: 'bg-svc-olive-bg',
    ink: 'text-svc-olive-ink',
    border: 'border-svc-olive-ink',
    ring: 'ring-svc-olive-ink',
  },
  sage: {
    bg: 'bg-svc-sage-bg',
    ink: 'text-svc-sage-ink',
    border: 'border-svc-sage-ink',
    ring: 'ring-svc-sage-ink',
  },
  jade: {
    bg: 'bg-svc-jade-bg',
    ink: 'text-svc-jade-ink',
    border: 'border-svc-jade-ink',
    ring: 'ring-svc-jade-ink',
  },
  teal: {
    bg: 'bg-svc-teal-bg',
    ink: 'text-svc-teal-ink',
    border: 'border-svc-teal-ink',
    ring: 'ring-svc-teal-ink',
  },
  sky: {
    bg: 'bg-svc-sky-bg',
    ink: 'text-svc-sky-ink',
    border: 'border-svc-sky-ink',
    ring: 'ring-svc-sky-ink',
  },
  fog: {
    bg: 'bg-svc-fog-bg',
    ink: 'text-svc-fog-ink',
    border: 'border-svc-fog-ink',
    ring: 'ring-svc-fog-ink',
  },
  slate: {
    bg: 'bg-svc-slate-bg',
    ink: 'text-svc-slate-ink',
    border: 'border-svc-slate-ink',
    ring: 'ring-svc-slate-ink',
  },
  denim: {
    bg: 'bg-svc-denim-bg',
    ink: 'text-svc-denim-ink',
    border: 'border-svc-denim-ink',
    ring: 'ring-svc-denim-ink',
  },
  lavender: {
    bg: 'bg-svc-lavender-bg',
    ink: 'text-svc-lavender-ink',
    border: 'border-svc-lavender-ink',
    ring: 'ring-svc-lavender-ink',
  },
  mauve: {
    bg: 'bg-svc-mauve-bg',
    ink: 'text-svc-mauve-ink',
    border: 'border-svc-mauve-ink',
    ring: 'ring-svc-mauve-ink',
  },
  plum: {
    bg: 'bg-svc-plum-bg',
    ink: 'text-svc-plum-ink',
    border: 'border-svc-plum-ink',
    ring: 'ring-svc-plum-ink',
  },
}

/**
 * Etiqueta humana del color. Usada como `aria-label` del chip y title
 * tooltip. No mostrada de forma persistente en pantalla — el barbero ve el
 * color, no su nombre.
 */
export const SERVICE_COLOR_LABELS: Record<ServiceColorToken, string> = {
  blush: 'Rubor',
  brick: 'Ladrillo',
  coral: 'Coral',
  terracota: 'Terracota',
  peach: 'Melocotón',
  stone: 'Piedra',
  oat: 'Avena',
  sand: 'Arena',
  gold: 'Oro',
  mustard: 'Mostaza',
  olive: 'Oliva',
  sage: 'Salvia',
  jade: 'Jade',
  teal: 'Verde azulado',
  sky: 'Cielo',
  fog: 'Niebla',
  slate: 'Pizarra',
  denim: 'Tejano',
  lavender: 'Lavanda',
  mauve: 'Malva',
  plum: 'Ciruela',
}
