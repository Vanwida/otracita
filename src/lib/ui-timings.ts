// -----------------------------------------------------------------------------
// ui-timings — duraciones canónicas de feedback transitorio.
//
// ÚNICA fuente. Antes 15+ `setTimeout(..., 2000)` / `2500` / `1500` regados
// con tres valores divergentes ("copied" duraba 2s, "saved" 2.5s, "idle"
// flash 1.5s — sin razón clara, sólo deriva). Cada caller copiaba el número
// del vecino sin pensarlo.
//
// Tres roles funcionales:
//   · COPIED → "Copiado al portapapeles" / "Link copiado"
//      Visual: chip verde con check. Time: 2s — el usuario ya hizo el copy
//      y se va; sólo necesita confirmación visual breve.
//   · SAVED  → "Cambios guardados" tras autosave / submit
//      Visual: badge "Guardado" o tick. Time: 2.5s — el usuario suele estar
//      mirando el formulario, le damos un beat más para procesar.
//   · IDLE_FLASH → flash de estado breve (un input acaba de validar)
//      Visual: borde / ring brand. Time: 1.5s — más sutil, no exige lectura.
//
// Si una vista necesita una duración distinta, NO copies el número — añade
// una nueva clave aquí. Si tres vistas la copian, ya es un patrón.
// -----------------------------------------------------------------------------

/** Duraciones (ms) de feedback transitorio del dashboard. */
export const FEEDBACK_MS = {
  /** "Copiado al portapapeles" / "Link copiado" — confirmación de copy. */
  copied: 2000,
  /** "Guardado" tras submit / autosave — el usuario sigue mirando el form. */
  saved: 2500,
  /** Flash sutil de validación / estado transitorio (no exige lectura). */
  idleFlash: 1500,
  /** Toast de undo (acción destructiva con ventana de deshacer). 6s da
   *  tiempo a leer + decidir + clicar sin agobiar. Patrón Gmail. */
  undoToast: 6000,
} as const
