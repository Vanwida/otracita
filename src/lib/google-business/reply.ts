// -----------------------------------------------------------------------------
// Generación de respuestas a reseñas de Google — LLM vía OpenRouter (mismo
// patrón que src/app/api/dashboard-chat/route.ts: SDK `openai` apuntando a
// la base URL de OpenRouter).
//
// La medida antispam es load-bearing: Google penaliza (y puede llegar a
// ocultar/desindexar) respuestas que leen como plantilla repetida. Por eso
// el prompt SIEMPRE incluye las últimas respuestas ya publicadas del mismo
// negocio con instrucción explícita de no repetir apertura ni estructura —
// ver `buildUserPrompt`.
// -----------------------------------------------------------------------------

import OpenAI from 'openai'

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

/** Modelo único — cambiar aquí, no inline en las llamadas. */
export const GOOGLE_REVIEWS_REPLY_MODEL = 'openai/gpt-5.6-terra'

/** Límite real de Google para el campo `comment` de una reply. */
export const MAX_REPLY_LENGTH = 4000

/** El caller es un cron — timeout corto para no bloquear el sweep de un
 *  tenant si OpenRouter tarda. */
const LLM_TIMEOUT_MS = 15_000

export interface GenerateReplyInput {
  businessName: string
  /** Barbero que atendió, si se conoce. Hoy las reseñas de Google no traen
   *  vínculo a una cita/servicio concreto, así que normalmente es null —
   *  el campo existe para cuando haya un matching fiable (fuera de scope
   *  de este cron). */
  barberName?: string | null
  service?: string | null
  /** Nombre del reviewer tal cual lo da Google (`reviewerName` en la fila
   *  de `google_reviews`). Null en reseñas anónimas — sigue funcionando
   *  igual que antes en ese caso. Ver reglas de uso en SYSTEM_PROMPT: no
   *  es una apertura fija, y el modelo tiene permiso explícito de
   *  ignorarlo si no parece un nombre real (handle, iniciales, emoji). */
  reviewerName?: string | null
  reviewText: string | null
  starRating: number
  /** Últimas respuestas YA publicadas por IA para este negocio. Solo sirven
   *  como referencia anti-repetición — nunca se citan ni se muestran al
   *  cliente. */
  recentReplies: string[]
}

const SYSTEM_PROMPT = `Eres quien responde las reseñas de Google Maps en nombre de una barbería española. Escribes en castellano de España, con un tono cercano y profesional — nunca cursi, nunca robótico, nunca de "departamento de atención al cliente".

Reglas de formato:
- Texto plano. CERO markdown: nada de **negrita**, títulos con #, listas con guiones/asteriscos, ni enlaces [texto](url).
- Máximo ${MAX_REPLY_LENGTH} caracteres, pero una buena respuesta real ocupa 2-5 frases cortas.
- No firmes con el nombre del negocio al final — Google ya muestra quién responde.

Reglas de contenido:
- Si la reseña trae texto, responde a lo que dice de verdad (no genérico).
- Si no trae texto, agradece la valoración sin inventar detalles que el cliente no dio.
- Si la valoración es de 1 a 3 estrellas: reconoce el problema sin ponerte a la defensiva ni dar excusas genéricas, discúlpate si aplica, e invita a contactar directamente con el negocio para solucionarlo.
- Si la valoración es de 4 o 5 estrellas: agradece con calidez, específico si hay con qué serlo.
- NUNCA inventes nombres de clientes, barberos o servicios que no te hayan dado explícitamente.

Sobre el nombre del cliente (cuando se te da uno — nunca lo inventas, esto no contradice la regla anterior; aquí solo decides si USAR o no un dato que ya tienes):
- Úsalo con naturalidad cuando encaje, en cualquier punto de la frase — no hace falta que sea siempre el saludo inicial.
- NO lo conviertas en tu apertura fija ("Hola, [nombre],  " en todas las respuestas) — sería exactamente la misma plantilla detectable que prohíbe la regla anti-plantilla de abajo. Es una herramienta más para variar, no la nueva fórmula.
- Los nombres que da Google a veces NO son nombres reales: usuarios tipo "xX_barber23_Xx", solo iniciales, una letra suelta, emojis. Si lo que te dan no suena a algo que dirías en voz alta para dirigirte a una persona, tienes permiso explícito para NO usarlo — agradece igual, sin nombrar a nadie. Mejor omitirlo que sonar raro.

Regla crítica anti-plantilla: Google penaliza (y puede ocultar) respuestas que leen como copiadas unas de otras. Se te muestran las últimas respuestas que este negocio ya publicó — tu respuesta NO puede empezar con la misma fórmula que ninguna de ellas, ni seguir su misma estructura de frases. Varía el arranque, el orden de las ideas y el vocabulario de agradecimiento cada vez.`

function buildUserPrompt(input: GenerateReplyInput): string {
  const lines = [
    `Negocio: ${input.businessName}`,
    input.barberName ? `Barbero que atendió: ${input.barberName}` : null,
    input.service ? `Servicio: ${input.service}` : null,
    input.reviewerName
      ? `Nombre del cliente (tal cual lo da Google — decide si usarlo, ver reglas): ${input.reviewerName}`
      : 'Nombre del cliente: no disponible (reseña anónima).',
    `Valoración: ${input.starRating}/5 estrellas`,
    `Reseña del cliente: ${input.reviewText ?? '(sin comentario de texto, solo la valoración numérica)'}`,
    '',
    input.recentReplies.length > 0
      ? [
          'Últimas respuestas YA publicadas por este negocio (NO repitas su apertura ni su estructura):',
          ...input.recentReplies.map((r, i) => `${i + 1}. ${r}`),
        ].join('\n')
      : 'Este negocio todavía no tiene respuestas previas publicadas por IA.',
    '',
    'Escribe la respuesta a esta reseña.',
  ]
  return lines.filter((l) => l !== null).join('\n')
}

/**
 * Genera el texto de respuesta a una reseña. No valida ni trunca — el
 * caller debe pasar el resultado por `validateReply` antes de publicarlo.
 */
export async function generateReviewReply(input: GenerateReplyInput): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    const completion = await openrouter.chat.completions.create(
      {
        model: GOOGLE_REVIEWS_REPLY_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        max_tokens: 500,
        temperature: 0.9,
      },
      { signal: controller.signal },
    )
    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    if (!text) throw new Error('OpenRouter devolvió una respuesta vacía')
    return text
  } finally {
    clearTimeout(timer)
  }
}

// -----------------------------------------------------------------------------
// Validación pura — sin red, testeable directo.
// -----------------------------------------------------------------------------

/** Heurísticas de detección de markdown — no es un parser completo, pero
 *  cubre lo que un LLM produce cuando "se olvida" de la instrucción de
 *  texto plano: negrita, headings, listas, enlaces, código. */
const MARKDOWN_PATTERNS: RegExp[] = [
  /\*\*[^*]+\*\*/, // **negrita**
  /__[^_]+__/, // __negrita__
  /`[^`]+`/, // `code`
  /^#{1,6}\s/m, // # heading
  /^[-*+]\s/m, // - bullet / * bullet
  /^>\s/m, // > blockquote
  /\[[^\]]+\]\([^)]+\)/, // [texto](url)
]

export interface ValidateReplyResult {
  ok: boolean
  reason?: 'empty' | 'too_long' | 'markdown'
}

export function validateReply(text: string): ValidateReplyResult {
  if (!text || !text.trim()) return { ok: false, reason: 'empty' }
  if (text.length > MAX_REPLY_LENGTH) return { ok: false, reason: 'too_long' }
  if (MARKDOWN_PATTERNS.some((re) => re.test(text))) return { ok: false, reason: 'markdown' }
  return { ok: true }
}

/** Solo 4 y 5 estrellas se publican automáticamente. 1-3 siempre pasan por
 *  el barbero (draft + email) — una respuesta automática a una reseña mala
 *  mal calibrada es peor que no responder. */
export function shouldAutoPublish(starRating: number): boolean {
  return starRating === 4 || starRating === 5
}
