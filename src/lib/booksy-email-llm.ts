import OpenAI from 'openai';
import type { BooksyBookingData } from '@/lib/booksy-email-parser';

/**
 * LLM-powered fallback for Booksy emails when the regex parser fails or
 * returns partial data. Booksy will change their email format some day and
 * silently break our parser; this module is the safety net that keeps the
 * sync alive until Alex updates the regex. Uses Grok (via the xAI OpenAI-
 * compatible endpoint) because it's already the project's standard cheap
 * extraction model — see `src/app/api/scrape-booksy/route.ts`.
 */

const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

/**
 * Hard cap on how long we wait for the LLM before giving up. Must be short —
 * the caller is an inbound webhook and Postmark retries on slow responses.
 */
const LLM_TIMEOUT_MS = 8_000;

/**
 * Critical fields that must be present for a booking to be safely inserted.
 * Missing any of these means we have an incomplete booking and should NOT
 * create it silently — better to alert and let the human decide.
 */
export const CRITICAL_FIELDS = ['type', 'date', 'time', 'service', 'barber'] as const;

export type CriticalField = (typeof CRITICAL_FIELDS)[number];

const SYSTEM_PROMPT = `Eres un extractor de datos para un sistema de reservas de barbería que se sincroniza con Booksy por email.

Vas a recibir el asunto y el cuerpo (texto plano) de un email de confirmación, modificación o cancelación enviado por Booksy. Tu trabajo es extraer los datos estructurados de la reserva.

Devuelve SOLO JSON válido, sin markdown, sin texto extra. Esquema exacto:

{
  "type": "new" | "modified" | "cancelled",
  "booksyBookingId": string | null,   // ID numérico de la reserva si aparece (5-12 dígitos)
  "customerName": string | null,      // nombre del cliente
  "customerPhone": string | null,     // teléfono del cliente si aparece
  "service": string | null,           // nombre del servicio (ej. "Corte de pelo", "Corte + Barba")
  "barber": string | null,            // nombre del profesional
  "date": string | null,              // YYYY-MM-DD
  "time": string | null,              // HH:MM inicio
  "duration": number | null,          // minutos, calcula desde rango si está presente
  "price": number | null              // euros como entero
}

Reglas:
- type: "new" para confirmaciones/nuevas reservas, "modified" para cambios/reprogramaciones, "cancelled" para cancelaciones.
- Si un campo no aparece en el email devuélvelo como null, NO inventes datos.
- Fechas en formato ISO: si el email dice "Lunes, 28 de abril de 2025" → "2025-04-28".
- Nombres en Title Case limpio, no ALL CAPS.
- Si no puedes identificar el tipo de email (no es una notificación de reserva) devuelve exactamente: {"type": null}`;

/**
 * Returns the subset of critical fields that are null/empty in the given data.
 * Used to decide if a parse result is 'full', 'partial', or needs LLM fallback.
 */
export function findMissingCriticalFields(
  data: Partial<BooksyBookingData> | null,
): CriticalField[] {
  if (!data) return [...CRITICAL_FIELDS];
  return CRITICAL_FIELDS.filter((field) => {
    const value = data[field];
    return value === null || value === undefined || value === '';
  });
}

function coerceType(value: unknown): BooksyBookingData['type'] | null {
  if (value === 'new' || value === 'modified' || value === 'cancelled') return value;
  return null;
}

function coerceString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sanitizeLlmOutput(raw: unknown): BooksyBookingData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const type = coerceType(obj.type);
  if (!type) return null; // LLM could not identify it as a booking email
  return {
    type,
    booksyBookingId: coerceString(obj.booksyBookingId),
    customerName: coerceString(obj.customerName),
    customerPhone: coerceString(obj.customerPhone),
    service: coerceString(obj.service),
    barber: coerceString(obj.barber),
    date: coerceString(obj.date),
    time: coerceString(obj.time),
    duration: coerceInt(obj.duration),
    price: coerceInt(obj.price),
  };
}

/**
 * Try to extract booking data from a Booksy email using the LLM.
 * Returns null on any failure (API down, bad JSON, unparseable response).
 * Never throws — caller should treat null as "LLM could not help, keep going
 * with whatever we had" and alert the operator.
 */
export async function extractBooksyDataWithLlm(
  subject: string,
  textBody: string,
): Promise<BooksyBookingData | null> {
  if (!process.env.XAI_API_KEY) {
    console.error('[booksy-email-llm] XAI_API_KEY not set — skipping LLM fallback');
    return null;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    const completion = await grok.chat.completions.create(
      {
        model: 'grok-4-1-fast-non-reasoning',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `ASUNTO:\n${subject}\n\nCUERPO:\n${textBody.slice(0, 8000)}`,
          },
        ],
        max_tokens: 800,
        temperature: 0,
      },
      { signal: controller.signal },
    );

    clearTimeout(timer);

    const content = completion.choices[0]?.message?.content ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[booksy-email-llm] LLM returned no JSON:', content.slice(0, 200));
      return null;
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return sanitizeLlmOutput(parsed);
  } catch (error) {
    console.error('[booksy-email-llm] extraction failed:', error);
    return null;
  }
}
