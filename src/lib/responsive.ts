// -----------------------------------------------------------------------------
// responsive — constantes y helpers de breakpoints del dashboard.
//
// Una sola fuente de verdad del "qué es mobile" para que (a) los componentes
// no rieguen `window.innerWidth < 768` con un número mágico, y (b) si en
// algún momento el shell cambia de breakpoint (de md a sm/lg), un solo
// fichero captura el cambio.
//
// El valor 768 NO es arbitrario: coincide con Tailwind `md:` (la break entre
// móvil y tablet/desktop-compact del dashboard, fijada en `layout.tsx`).
// Cambiarlo aquí sin cambiar también las clases `md:*` rompería la coherencia
// CSS/JS — por eso el comentario es explícito.
// -----------------------------------------------------------------------------

/**
 * Breakpoint mobile/tablet del dashboard, en píxeles. Coincide con Tailwind
 * `md` (768). Bajo este ancho el shell muestra top-bar + bottom-nav + drawer;
 * a partir de aquí, rail lateral inline (modo desktop-compact, iPad-as-POS).
 */
export const MOBILE_BREAKPOINT_PX = 768

/**
 * `true` si el viewport actual está por debajo del breakpoint mobile.
 * SSR-safe: en servidor (donde `window` no existe) devuelve `false` —
 * el cliente recalcula tras hidratar. NO usar para decisiones de RENDERIZADO
 * inicial (causaría hydration mismatch); úsalo solo para decisiones
 * IMPERATIVAS post-acción (auto-cerrar un drawer, redirigir, etc.).
 *
 * Para render condicional usa clases responsive Tailwind (`md:hidden`,
 * `hidden md:flex`) — son CSS-first y no parpadean.
 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < MOBILE_BREAKPOINT_PX
}
