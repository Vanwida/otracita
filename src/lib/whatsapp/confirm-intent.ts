// ---------------------------------------------------------------------------
// ¿El cliente ha dicho "sí" de verdad?
//
// El paso `confirming` del bot decidía con `lower.includes('si')`, así que
// "lo siento, no puedo", "necesito cambiarlo" o "imposible" contienen la
// subcadena "si" y creaban la reserva. Aquí la decisión es una **lista
// cerrada con `===`** sobre el texto normalizado: si el mensaje entero no es
// un sí, no es un sí.
//
// Sin LLM a propósito: clasificar el sí con un modelo añade latencia, coste y
// no determinismo justo en el punto donde se crea una cita real.
//
// La lista mezcla ES y EN en un único set. El match es exacto, así que no hay
// riesgo de falso positivo por aceptar "yes" en una conversación en español —
// y la detección de idioma del engine es heurística por mensaje, puede
// cambiar a mitad de flujo.
// ---------------------------------------------------------------------------

/** IDs de botón interactivo que valen como confirmación (llegan crudos). */
const AFFIRMATIVE_BUTTON_IDS = new Set(['confirm_yes']);

/** Mensajes que, siendo el texto COMPLETO, son un sí inequívoco. */
const AFFIRMATIVE_PHRASES = new Set([
  // Español
  'si',
  'sip',
  'vale',
  'ok',
  'oka',
  'okay',
  'okey',
  'confirmo',
  'confirmar',
  'confirmado',
  'confirmada',
  'dale',
  'venga',
  'claro',
  'correcto',
  'perfecto',
  'adelante',
  'si confirmar',
  'si confirmo',
  'si por favor',
  'si gracias',
  'de acuerdo',
  // Inglés
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'confirm',
  'confirmed',
  'yes confirm',
  'yes please',
  'go ahead',
  'sounds good',
]);

/** Alargamientos tipo "siii" / "siiiii" — mismo sí, con énfasis. */
const AFFIRMATIVE_PATTERNS = [/^si+$/];

/**
 * Minúsculas, sin acentos, sin puntuación ni emoji, espacios colapsados.
 * "Sí!" → "si"; "Sí, confirmar 👍" → "si confirmar".
 */
export function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * `true` sólo para el botón `confirm_yes` o un sí explícito de la lista
 * cerrada. Todo lo demás — incluido "lo siento, no puedo" — es `false`.
 */
export function isAffirmativeReply(text: string): boolean {
  if (AFFIRMATIVE_BUTTON_IDS.has(text)) return true;

  const normalized = normalizeReply(text);
  if (!normalized) return false;

  return (
    AFFIRMATIVE_PHRASES.has(normalized) ||
    AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

// ---------------------------------------------------------------------------
// Cancelar / cambiar (U-04)
//
// Los pasos `cancel_confirming` y `changing` decidían con
// `lower.includes('si')`, con el mismo fallo que `confirming`: "lo siento, no
// puedo ir" cancelaba la cita de verdad. Misma solución — lista cerrada con
// match exacto sobre el texto normalizado.
//
// Aquí la lista es más ancha que la de `confirming` porque la pregunta es
// "¿quieres cancelar tu cita del martes?": responder "cancelala" o "anula" es
// tan afirmativo como "sí". Un sí genérico ("vale", "ok", "confirmo") también
// vale, así que reutilizamos `isAffirmativeReply` como base.
// ---------------------------------------------------------------------------

/** Respuestas que, siendo el texto COMPLETO, piden cancelar la cita. */
const CANCEL_PHRASES = new Set([
  // Español
  'cancelar',
  'cancela',
  'cancelala',
  'cancelalo',
  'cancelada',
  'si cancelar',
  'si cancela',
  'si cancelala',
  'si cancelalo',
  'anular',
  'anula',
  'anulala',
  'anulalo',
  'si anular',
  'borrala',
  'borralo',
  'eliminala',
  'eliminalo',
  'quitala',
  'quitalo',
  // Inglés
  'cancel',
  'cancel it',
  'yes cancel',
  'cancel please',
  'delete it',
]);

/** Respuestas que, siendo el texto COMPLETO, piden cambiar la cita. */
const CHANGE_PHRASES = new Set([
  // Español
  'cambiar',
  'cambia',
  'cambiala',
  'cambialo',
  'cambio',
  'si cambiar',
  'si cambia',
  'si cambiala',
  'si cambialo',
  'mover',
  'moverla',
  'muevela',
  'muevelo',
  'reprogramar',
  'otro dia',
  'otra hora',
  // Inglés
  'change',
  'change it',
  'yes change',
  'reschedule',
  'move it',
]);

/**
 * `true` sólo para el botón `cancel_yes`, un sí explícito, o una petición
 * directa de cancelar. "lo siento, no puedo ir" es `false`.
 */
export function isCancelYes(text: string): boolean {
  if (text === 'cancel_yes') return true;
  if (isAffirmativeReply(text)) return true;

  return CANCEL_PHRASES.has(normalizeReply(text));
}

/**
 * `true` sólo para el botón `change_yes`, un sí explícito, o una petición
 * directa de cambiar. "lo siento, no puedo ir" es `false`.
 */
export function isChangeYes(text: string): boolean {
  if (text === 'change_yes') return true;
  if (isAffirmativeReply(text)) return true;

  return CHANGE_PHRASES.has(normalizeReply(text));
}

// ---------------------------------------------------------------------------
// Escape global
//
// El engine reinicia la conversación desde cualquier paso si el mensaje es una
// palabra de escape. "cancelar" estaba en esa lista, así que en
// `cancelling` / `cancel_confirming` / `changing` el cliente escribía
// "cancelar" para anular su cita, el bot le devolvía al menú y **la cita
// seguía viva**. Dentro de esos pasos "cancelar" es un sí, no una huida:
// sólo las palabras inequívocas de navegación (menu, salir, inicio…) escapan.
// ---------------------------------------------------------------------------

/** Escape en cualquier paso: navegación pura, nunca ambigua. */
const ESCAPE_PHRASES = new Set([
  'reset',
  'reiniciar',
  'salir',
  'exit',
  'menu',
  'inicio',
  'empezar',
  'start',
]);

/** Escape sólo FUERA de los flujos de cancelar/cambiar. */
const CANCEL_ESCAPE_PHRASES = new Set(['cancelar', 'cancel']);

/**
 * ¿El mensaje pide volver al menú? `inCancelFlow` marca los pasos donde
 * "cancelar" significa "sí, cancela mi cita" y por tanto NO escapa.
 */
export function isEscapeCommand(
  text: string,
  { inCancelFlow }: { inCancelFlow: boolean },
): boolean {
  const normalized = normalizeReply(text);
  if (!normalized) return false;

  if (ESCAPE_PHRASES.has(normalized)) return true;

  return !inCancelFlow && CANCEL_ESCAPE_PHRASES.has(normalized);
}
