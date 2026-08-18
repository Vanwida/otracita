// -----------------------------------------------------------------------------
// format — formateo de dinero para la app nativa (Capacitor).
//
// Espejo mínimo de `src/lib/format.ts` del dashboard: la app móvil es un
// build independiente y no comparte el alias `@/`, así que replicamos SOLO
// lo que se usa aquí en vez de acoplar los dos proyectos.
//
// Convención otracita: TODO el dinero viaja y se persiste en CÉNTIMOS
// enteros. Los euros solo existen en la frontera con el humano.
// -----------------------------------------------------------------------------

const EUR = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Céntimos → "12,50 €" (locale es-ES). */
export function formatCents(cents: number): string {
  return `${EUR.format(cents / 100)} €`
}
