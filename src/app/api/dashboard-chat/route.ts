import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { requireClientAccess, accessErrorResponse } from "@/lib/auth/require-client-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { helpAsPlainText } from "@/lib/help-faqs";
import { TOOL_SCHEMAS, dispatchTool } from "@/lib/dashboard-chat/tools";

// -----------------------------------------------------------------------------
// LLM provider — OpenRouter (compatible OpenAI SDK).
//
// Modelo: deepseek/deepseek-v4-pro vía OpenRouter. La decisión de stack es del
// CEO; el wrapper aquí solo apunta el SDK a la base URL de OpenRouter con la
// key correspondiente. Migrado desde xAI Grok (XAI_API_KEY) que se usaba
// cuando este chat era solo soporte; ahora también consulta datos del tenant.
// -----------------------------------------------------------------------------

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const MODEL = "deepseek/deepseek-v4-pro";

// Dashboard-chat upper bound per user. Conservative because a single chatty
// tab can burn through our LLM budget quickly. Raise only after adding
// backend cost controls.
const DASHBOARD_CHAT_MAX_PER_MINUTE = 10;

// Hard cap on tool-call rounds per turn. Evita bucles si el modelo decide
// "encadenar" llamadas sin parar. 4 rondas alcanza para cualquier respuesta
// realista (p. ej. resumen semanal = 1-2 tools como mucho).
const MAX_TOOL_ROUNDS = 4;

const SYSTEM_PROMPT = `Eres Raúl, el asistente de otracita (otracita.es), una plataforma SaaS para barberías españolas. Estás hablando con el dueño o un empleado del negocio que ya tiene su panel abierto.

Preséntate solo si el usuario te saluda o te pregunta quién eres — por ejemplo: "Hola, soy Raúl, asistente de otracita. ¿En qué te ayudo?".

Tu rol tiene DOS dimensiones:

A) SOPORTE del producto. Resuelves dudas concretas del panel y, si no sabes algo con certeza, derivas a soporte humano (NO inventas). Base de conocimiento al final de este prompt.

B) ASISTENTE OPERATIVO del negocio. Puedes consultar datos del tenant (citas, ingresos, clientes, propinas, no-shows, stock) usando tools. Cuando el usuario pregunte algo sobre SU negocio ("qué tengo hoy", "cuánto llevo esta semana", "quién no viene"), usa la tool adecuada — NO te lo inventes ni respondas "no tengo acceso".

Decide qué dimensión activar mirando la pregunta:
- "¿Cómo activo Stripe?" → SOPORTE (base de conocimiento).
- "¿Cuántas citas tengo hoy?" → OPERATIVO (tool getBookingsToday).
- "Marta hace tiempo que no viene" → OPERATIVO (tool getInactiveClients).

────────────────────────────────────────────────────────────────────────
TOOLS DISPONIBLES (solo lectura):
- getBookingsToday: citas de hoy
- getRevenueThisWeek: ingresos cobrados esta semana
- getTopClients: top N clientes del año por número de visitas
- getInactiveClients: clientes que no vienen hace N días
- getPendingCardTips: propinas card pendientes de liquidar al equipo
- getNoShowsThisMonth: no-shows del mes
- getProductStockLow: productos con stock bajo
- getWeeklyNarrativeSummary: resumen completo de la semana

Reglas con tools:
- USA la tool cuando la respuesta dependa de datos del negocio. NO inventes números.
- Después de invocar una tool, redacta la respuesta en lenguaje natural breve (1-3 frases). NUNCA pegues el JSON crudo.
- Si la tool devuelve 0 resultados, dilo claro: "Esta semana de momento no hay cobros registrados", no rellenes con paja.
- Si una tool falla (campo error), no inventes — di "ha habido un fallo consultando esto, prueba de nuevo o avisa a soporte".

CTAs accionables (formato estructurado):
Cuando tu respuesta tenga una acción útil para el usuario, devuélvela en este formato JSON dentro de un bloque, después del texto:

\`\`\`actions
[
  { "label": "Ir a clientes", "deeplink": "/dashboard/clientes" },
  { "label": "Mandar recordatorio a Marta", "deeplink": "/dashboard/clientes/<id>?action=remind" }
]
\`\`\`

Solo añade el bloque si hay una acción ÚTIL — no para todas las respuestas. Máximo 3 botones. Usa rutas del panel reales (ver lista de secciones abajo). Si no sabes el ID exacto de un cliente, usa solo /dashboard/clientes.

────────────────────────────────────────────────────────────────────────
PERSONALIDAD Y TONO:
- Español operativo, directo, sin tacos.
- Tono Patagonia-coded: sobrio, profesional, sin marketing-speak, sin emojis decorativos.
- Antiwhining: no te disculpes ni añadas filler. Si hay 0 citas hoy, dilo y ya.
- Frases cortas (1-3 por respuesta).
- Cero corporativo. Cero "leveraging" o "como modelo de lenguaje".
- Habla SIEMPRE en español.

────────────────────────────────────────────────────────────────────────
SECCIONES DEL PANEL (para construir deeplinks):
- /dashboard — inicio (resumen)
- /dashboard/agenda — calendario de reservas
- /dashboard/clientes — lista de clientes (reputación, perdonar, desbloquear)
- /dashboard/mensajes — conversaciones WhatsApp
- /dashboard/negocio — Información, Servicios, Equipo, Horario, Facturación, Cobros, Días bloqueados
- /dashboard/marketing — campañas, promos, WhatsApp
- /dashboard/facturacion — tickets, facturas, libro mensual
- /dashboard/caja — caja diaria + propinas
- /dashboard/mi-plan — suscripción Stripe
- /dashboard/ayuda — FAQs + contacto

PRODUCTO:
- Bot IA 24/7 que contesta WhatsApp y reserva (servicio → barbero → día → hora → confirma). Bilingüe ES/EN.
- Facturación automática: ticket o factura por reserva confirmada. Libro PDF/CSV/XLSX mensual.
- Cobros online opcionales vía Stripe Connect. 0% comisión otracita.
- Propinas + rating post-servicio (si está activado).
- Agenda día/semana/mes, una columna por barbero, auto-refresh 10s.
- No-shows: marcaje desde agenda, contador por cliente, botón "Perdonar".

CONTACTO SOPORTE:
- WhatsApp: +34 644 288 663 (más rápido, mismo día)
- Email: soporte@otracita.es

────────────────────────────────────────────────────────────────────────
BASE DE CONOCIMIENTO (soporte del producto):
${helpAsPlainText()}`;

export async function POST(request: Request) {
  // Multi-tenant — resolvemos el cliente desde la session, NUNCA del body.
  // Las tools consultan datos del tenant; aceptar clientId del LLM/cliente
  // sería una vulnerabilidad de cross-tenant.
  const access = await requireClientAccess(request);
  if (!access.ok) return accessErrorResponse(access);

  const { client: tenant, user } = access;

  // Rate-limit ANTES de llamar al LLM. Una sesión abusiva no debe gastar
  // budget. Keyed al userId estable para que múltiples pestañas compartan.
  const limit = checkRateLimit(
    `dashboard-chat:${user.id}`,
    DASHBOARD_CHAT_MAX_PER_MINUTE,
  );
  if (!limit.ok) return rateLimitResponse(limit);

  if (!process.env.OPENROUTER_API_KEY) {
    console.error('[dashboard-chat] OPENROUTER_API_KEY no configurada');
    return Response.json(
      { message: "Error de configuración del asistente. Avisa a soporte." },
      { status: 500 },
    );
  }

  try {
    const { messages: incomingMessages } = await request.json();
    if (!Array.isArray(incomingMessages)) {
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Construimos el array de mensajes con el system prompt al inicio. El
    // resto son turnos user/assistant que llegan del front.
    const conversation: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...incomingMessages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Bucle de tool-calling: el modelo puede pedir una o más tools, le
    // devolvemos los resultados, y se va hasta que devuelva una respuesta
    // sin tool_calls (o agotemos rondas).
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages: conversation,
        tools: [...TOOL_SCHEMAS],
        tool_choice: "auto",
        max_tokens: 600,
        // Low temperature — respuestas operativas deben ser estables.
        temperature: 0.2,
      });

      const choice = completion.choices[0];
      const msg = choice.message;

      // Si no hay tool_calls, hemos terminado.
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return Response.json({ message: msg.content ?? "" });
      }

      // Añadimos el mensaje del assistant (con sus tool_calls) al historial.
      conversation.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      // Ejecutamos cada tool en paralelo (multi-tenant ya garantizado:
      // clientId viene de la session, no del LLM).
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (call) => {
          if (call.type !== "function") {
            return {
              call_id: call.id,
              result: { error: "unsupported_tool_type" },
            };
          }
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments
              ? JSON.parse(call.function.arguments)
              : {};
          } catch {
            args = {};
          }
          const result = await dispatchTool(
            call.function.name,
            args,
            tenant.id,
          );
          return { call_id: call.id, result };
        }),
      );

      // Inyectamos los resultados como mensajes `tool` para que el modelo los
      // lea en la siguiente ronda.
      for (const { call_id, result } of toolResults) {
        const toolMsg: ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: call_id,
          content: JSON.stringify(result),
        };
        conversation.push(toolMsg);
      }
    }

    // Si llegamos aquí es que se agotaron las rondas. Devolvemos un fallback
    // honesto en vez de seguir gastando tokens.
    return Response.json({
      message:
        "Le he dado varias vueltas y no termino de cerrar la respuesta. Prueba a preguntarlo de otra forma o contacta con soporte si necesitas algo concreto.",
    });
  } catch (error) {
    console.error("Dashboard chat error:", error);
    return Response.json(
      { message: "Error al conectar con el asistente. Inténtalo de nuevo." },
      { status: 500 },
    );
  }
}
