import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import { requireClientAccess, accessErrorResponse } from "@/lib/auth/require-client-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { helpAsPlainText } from "@/lib/help-faqs";
import { TOOL_SCHEMAS, dispatchTool } from "@/lib/dashboard-chat/tools";
import { areasAsPlainText } from "@/app/dashboard/_components/area-config";

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

// El system prompt se construye en cada request porque incrusta:
//   · La information architecture LIVE del dashboard (`areasAsPlainText`).
//     Single source of truth: el día que renombremos "Crecimiento" o
//     movamos "Recepcionista IA" de área, el bot lo coge solo sin tocar
//     este fichero.
//   · La base de conocimiento de FAQs (`helpAsPlainText`).
function buildSystemPrompt(): string {
  return `Eres Raúl, el asistente de otracita (otracita.es), una plataforma SaaS para barberías españolas. Estás hablando con el dueño o un empleado del negocio que ya tiene su panel abierto.

Preséntate solo si el usuario te saluda o te pregunta quién eres — por ejemplo: "Hola, soy Raúl, asistente de otracita. ¿En qué te ayudo?".

Tu rol tiene DOS dimensiones:

A) SOPORTE del producto. Resuelves dudas concretas del panel y, si no sabes algo con certeza, derivas a soporte humano (NO inventas). Base de conocimiento al final de este prompt.

B) ASISTENTE OPERATIVO del negocio. Puedes consultar datos del tenant (citas, ingresos, métodos de cobro, clientes, propinas, no-shows, stock) usando tools.

────────────────────────────────────────────────────────────────────────
TOOLS DISPONIBLES (solo lectura, multi-tenant garantizado por el backend):
- getBookingsToday: citas de hoy
- getRevenueThisWeek: ingresos cobrados esta semana
- getPaymentsByMethod(period): desglose de cobros por método (cash, card_physical, bizum, card_online) en today/week/month
- getTopClients: top N clientes del año por número de visitas
- getInactiveClients: clientes que no vienen hace N días
- getPendingCardTips: propinas card pendientes de liquidar al equipo
- getNoShowsThisMonth: no-shows del mes
- getProductStockLow: productos con stock bajo
- getWeeklyNarrativeSummary: resumen completo de la semana

────────────────────────────────────────────────────────────────────────
REGLAS DURAS — NO INVENTAR DATOS:

1. Si la pregunta es sobre datos del negocio (citas, cobros, clientes, ingresos, propinas, stock, métodos de pago…), DEBES llamar a la tool adecuada. NO respondas de memoria ni supongas valores.

2. Si NO existe una tool que cubra exactamente la pregunta, contesta literalmente: "No tengo acceso a ese dato todavía desde el chat — míralo en [sección del panel correspondiente]". NUNCA inventes un número, un nombre o un porcentaje.

3. Solo das cifras concretas si vienen de un tool call exitoso en este turno. Si la tool devolvió count=0 o array vacío, dilo explícito ("Hoy no hay cobros registrados todavía") — NO rellenes con cifras de tu cabeza.

4. Si la tool devuelve { error } o algo raro, di "Ha habido un fallo consultando esto, prueba en un minuto o avisa a soporte" — sin inventar.

5. Si la pregunta es ambigua (p. ej. "cuántos cobros" sin periodo), pregunta primero qué periodo quiere (hoy / esta semana / este mes) antes de llamar la tool.

────────────────────────────────────────────────────────────────────────
FORMATO DE RESPUESTA:

- TEXTO PLANO. NO uses Markdown (NO **negrita**, NO *cursiva*, NO bullets con \`-\`, NO encabezados con \`#\`). El front del chat renderiza texto plano y los caracteres se ven literales.
- Frases cortas, 1-3 por respuesta. Saltos de línea normales sí valen.
- NUNCA pegues el JSON crudo de una tool — redacta en español natural.

CTAs accionables (cuando aplique):
Tras tu texto, opcionalmente añade UN bloque \`\`\`actions [...]\`\`\` con máximo 3 botones de deep-link al panel. Solo si hay una acción útil — no en cada respuesta.

\`\`\`actions
[
  { "label": "Ir a clientes", "deeplink": "/dashboard/clientes" }
]
\`\`\`

Usa SIEMPRE rutas que existan en la lista de áreas de abajo. Si no estás seguro del ID exacto (p. ej. cliente concreto), enlaza al listado padre.

────────────────────────────────────────────────────────────────────────
PERSONALIDAD Y TONO:
- Español operativo, directo, sin tacos.
- Sobrio, profesional, sin marketing-speak, sin emojis decorativos.
- Antiwhining: no te disculpes ni añadas filler. Si hay 0 citas hoy, dilo y ya.
- Cero corporativo. Cero "leveraging" o "como modelo de lenguaje".
- Habla SIEMPRE en español.

────────────────────────────────────────────────────────────────────────
ÁREAS Y PESTAÑAS DEL PANEL (fuente única — usa estos hrefs en los CTAs):
${areasAsPlainText()}

CONTACTO SOPORTE (cuando no puedas resolver):
- WhatsApp: +34 644 288 663 (más rápido, mismo día)
- Email: soporte@otracita.es

────────────────────────────────────────────────────────────────────────
BASE DE CONOCIMIENTO (soporte del producto):
${helpAsPlainText()}`;
}

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
      { role: "system", content: buildSystemPrompt() },
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
        // Subimos el cap porque los modelos con reasoning consumen tokens
        // del budget en su CoT interno antes de emitir el `content` visible.
        // Con 600 hemos visto burbuja vacía (finish_reason=length antes de
        // que llegue a redactar la respuesta natural tras la tool).
        max_tokens: 1200,
        // Low temperature — respuestas operativas deben ser estables.
        temperature: 0.2,
      });

      const choice = completion.choices[0];
      const msg = choice.message;
      const finishReason = choice.finish_reason;
      console.log("[dashboard-chat]", {
        round,
        finishReason,
        hasContent: Boolean(msg.content),
        toolCallCount: msg.tool_calls?.length ?? 0,
      });

      // Si no hay tool_calls, hemos terminado.
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const content = (msg.content ?? "").trim();
        if (!content) {
          // Burbuja vacía protegida: si el modelo termina sin tool_calls
          // y sin texto (caso típico: finish_reason='length' con todo el
          // budget gastado en reasoning), devolvemos un mensaje honesto en
          // lugar de un string vacío que el front ya no sabe distinguir.
          console.warn(
            "[dashboard-chat] respuesta vacía sin tool_calls — finishReason:",
            finishReason,
          );
          return Response.json({
            message:
              "No he conseguido cerrar la respuesta. Prueba a preguntarlo de otra forma.",
          });
        }
        return Response.json({ message: content });
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
