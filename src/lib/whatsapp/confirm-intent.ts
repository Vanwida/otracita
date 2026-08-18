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
