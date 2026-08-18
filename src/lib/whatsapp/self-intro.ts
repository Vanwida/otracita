// ---------------------------------------------------------------------------
// ¿El cliente se está presentando, o sólo ha empezado la frase con "soy"?
//
// El engine detectaba el cambio de nombre con un `match` suelto sobre el
// mensaje: `/(?:me llamo|mi nombre es|soy|llámame)\s+([letras]{1,20})/`. Como
// no estaba anclado ni filtraba nada, "hola, soy cliente nuevo y quiero cita"
// guardaba el nombre **Cliente**, contestaba "a partir de ahora te llamo
// Cliente 👍" y hacía `return` ANTES de `classifyIntent` — así que la reserva
// nunca arrancaba. Igual con el inglés: "i'm booking a haircut" → "Booking".
//
// Dos reglas, ambas necesarias:
//
//   1. La presentación tiene que ser el mensaje ENTERO (se tolera un saludo
//      delante: "hola, soy Juan"). Si detrás del nombre queda cualquier otra
//      cosa, no es una presentación — es una frase que empieza por "soy".
//   2. Lo que sigue al disparador tiene que parecer un nombre. Blacklist de
//      palabras que nunca lo son: roles (cliente, nuevo, barbero…), verbos de
//      intención (quiero, necesito…) y muletillas.
//
// La regla 1 sola no basta: "soy cliente nuevo" es un mensaje entero. La
// regla 2 sola tampoco: "soy Juan y quiero cita" pasaría la blacklist en la
// primera palabra. Hacen falta las dos.
//
// Sin LLM a propósito: es la misma decisión que `confirm-intent.ts` — una
// puerta determinista, sin latencia ni coste, en un punto donde equivocarse
// le cambia el nombre a un cliente real y le cancela la reserva.
//
// No se quita "soy" de los disparadores: "soy Juan" es la forma más natural
// de presentarse en español y sigue funcionando.
// ---------------------------------------------------------------------------

/** Saludos que pueden ir delante de la presentación: "hola, soy Juan". */
const GREETING_PREFIXES = new Set([
  'hola',
  'holaa',
  'buenas',
  'buenos',
  'dias',
  'días',
  'tardes',
  'noches',
  'wenas',
  'ey',
  'hey',
  'hi',
  'hello',
  'muy',
]);

/**
 * Disparadores de presentación, en tokens. Se comparan contra el inicio del
 * mensaje (ya sin saludo), así que el orden largo→corto importa: "mi nombre
 * es" tiene que probarse antes que cualquier prefijo suyo.
 */
const INTRO_TRIGGERS: string[][] = [
  ['mi', 'nombre', 'es'],
  ['me', 'llamo'],
  ['my', 'name', 'is'],
  ['llamame'],
  ['llámame'],
  ['call', 'me'],
  ['soy'],
  ['im'],
  ['i', 'am'],
];

/**
 * Palabras que nunca son un nombre propio. Si aparece alguna detrás del
 * disparador, el mensaje no es una presentación.
 *
 * Sin acentos ni mayúsculas: se comparan contra el texto ya normalizado.
 */
const NOT_A_NAME = new Set([
  // Roles — el caso que rompió la reserva
  'cliente',
  'clienta',
  'clientes',
  'client',
  'customer',
  'nuevo',
  'nueva',
  'nuevos',
  'nuevas',
  'new',
  'barbero',
  'barbera',
  'barberos',
  'barber',
  'peluquero',
  'peluquera',
  'peluqueria',
  'estilista',
  'chico',
  'chica',
  'hombre',
  'mujer',
  'amigo',
  'amiga',
  'hermano',
  'hermana',
  'primo',
  'prima',
  'vecino',
  'vecina',
  'persona',
  // Intención — "soy Juan y quiero cita" nunca debe pasar entero
  'quiero',
  'queria',
  'querria',
  'quisiera',
  'necesito',
  'busco',
  'buscando',
  'want',
  'need',
  'looking',
  'book',
  'booking',
  'cita',
  'citas',
  'reserva',
  'reservar',
  'reservas',
  'appointment',
  'hora',
  'horas',
  'turno',
  'corte',
  'cortarme',
  'pelarme',
  'pelo',
  'barba',
  'haircut',
  // Muletillas y conectores
  'yo',
  'el',
  'la',
  'lo',
  'los',
  'las',
  'un',
  'una',
  'uno',
  'de',
  'del',
  'para',
  'por',
  'que',
  'con',
  'sin',
  'mi',
  'tu',
  'su',
  'este',
  'esta',
  'aqui',
  'and',
  'the',
  'for',
  'from',
  'here',
  'cuando',
  'donde',
  'como',
  'porque',
  'tengo',
  'tienes',
  'tengas',
  'hay',
  'puedo',
  'puedes',
  'hueco',
  'huecos',
  'sitio',
  'mas',
  'tambien',
  'when',
  'where',
  'have',
  'has',
  'can',
  'slot',
  'slots',
  // Saludos / cortesía / respuestas sueltas
  'hola',
  'buenas',
  'gracias',
  'porfa',
  'favor',
  'please',
  'thanks',
  'si',
  'no',
  'ok',
  'vale',
  // Tiempo y disponibilidad
  'hoy',
  'manana',
  'tarde',
  'temprano',
  'ahora',
  'luego',
  'urgente',
  'disponible',
  'libre',
  'today',
  'tomorrow',
  'now',
  'later',
  'soon',
]);

/** Como mucho un nombre compuesto con apellidos: "juan carlos perez". */
const MAX_NAME_WORDS = 3;

/** Sólo letras. Descarta "2pac", "juan23" y cualquier resto numérico. */
const NAME_WORD = /^[a-záéíóúüñç]+$/;

/**
 * Minúsculas, puntuación y emoji fuera, espacios colapsados. Mantiene los
 * acentos: el nombre se guarda tal cual el cliente lo escribe ("José").
 * Los apóstrofos se comen para que "i'm" quede como el token "im".
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9áéíóúüñç\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Quita los saludos del principio: "hola buenas soy juan" → "soy juan". */
function stripGreeting(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length && GREETING_PREFIXES.has(tokens[i])) i++;
  // Un mensaje que es SÓLO saludo no es una presentación: se devuelve entero
  // para que no lo confunda con un nombre vacío.
  return i === tokens.length ? tokens : tokens.slice(i);
}

/** Devuelve los tokens que siguen al disparador, o `null` si no hay ninguno. */
function afterTrigger(tokens: string[]): string[] | null {
  for (const trigger of INTRO_TRIGGERS) {
    if (tokens.length < trigger.length) continue;
    if (trigger.every((word, i) => tokens[i] === word)) {
      return tokens.slice(trigger.length);
    }
  }
  return null;
}

/**
 * El nombre con el que el cliente se acaba de presentar, o `null` si el
 * mensaje no es una presentación.
 *
 * Devuelve sólo la primera palabra capitalizada — es con lo que el bot le
 * habla, y es el comportamiento que ya tenía el engine.
 *
 * ```
 * extractSelfIntroName('soy Juan')                      // 'Juan'
 * extractSelfIntroName('hola, me llamo José')           // 'José'
 * extractSelfIntroName('soy cliente nuevo y quiero cita') // null
 * ```
 */
export function extractSelfIntroName(text: string): string | null {
  const tokens = stripGreeting(tokenize(text));

  const nameWords = afterTrigger(tokens);
  if (!nameWords) return null;

  // "soy" a secas no presenta a nadie; más de 3 palabras ya es una frase.
  if (nameWords.length === 0 || nameWords.length > MAX_NAME_WORDS) return null;

  for (const word of nameWords) {
    if (word.length < 2) return null;
    if (!NAME_WORD.test(word)) return null;
    if (NOT_A_NAME.has(stripAccents(word))) return null;
  }

  const first = nameWords[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Sólo para comparar contra la blacklist: "josé" → "jose". */
function stripAccents(word: string): string {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
