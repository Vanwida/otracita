import OpenAI from "openai";
import { auth } from "@/lib/auth/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// Dashboard-chat upper bound per user. Conservative because a single chatty
// tab can burn through our LLM budget quickly. Raise only after adding
// backend cost controls.
const DASHBOARD_CHAT_MAX_PER_MINUTE = 10;

const SYSTEM_PROMPT = `Eres el asistente de soporte de otracita, una plataforma que instala chatbots de WhatsApp para negocios locales que se conectan con Booksy y Google Calendar.

Estás hablando con un cliente que ya tiene acceso al panel de otracita. Tu trabajo es ayudarles con dudas sobre:
- Cómo funciona su chatbot de WhatsApp
- Cómo configurar Booksy y Google Calendar
- Cómo interpretar sus estadísticas del panel
- Problemas técnicos o preguntas sobre su suscripción
- Cómo sacar el máximo partido al servicio

Información útil:
- El chatbot responde automáticamente mensajes de WhatsApp y agenda citas en Booksy vía Google Calendar
- La integración funciona conectando Booksy con Google Calendar, y el bot consulta ese calendario para ver disponibilidad
- Si el cliente tiene problemas que no puedes resolver, indícales que contacten con soporte escribiendo por WhatsApp al +34 711 248 500
- Los planes actuales: WhatsApp Bot (29€/mes), Bot + Ads Local (80€/mes)

Reglas:
- Responde SIEMPRE en español
- Sé breve y directo (máximo 3-4 frases)
- Sé amigable y cercano, como un colega de soporte
- Si no sabes algo con certeza, no lo inventes — deriva al soporte por WhatsApp
- Si el problema requiere acceso al sistema o configuración manual, indica que el equipo lo gestionará por WhatsApp`;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate-limit BEFORE the LLM call — an abusive session must not run up our
  // Grok bill. Keyed on the stable user id so multiple tabs share the budget.
  const limit = checkRateLimit(
    `dashboard-chat:${session.user.id}`,
    DASHBOARD_CHAT_MAX_PER_MINUTE,
  );
  if (!limit.ok) {
    return rateLimitResponse(limit);
  }

  try {
    const { messages } = await request.json();

    const completion = await client.chat.completions.create({
      model: "grok-4-1-fast-non-reasoning",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 300,
      temperature: 0.7,
    });

    return Response.json({
      message: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error("Dashboard chat error:", error);
    return Response.json(
      { message: "Error al conectar con el asistente. Inténtalo de nuevo." },
      { status: 500 }
    );
  }
}
