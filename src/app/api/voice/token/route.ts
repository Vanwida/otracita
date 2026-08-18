import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access';
import { requireFeature } from '@/lib/billing/tier';

// -----------------------------------------------------------------------------
// GET /api/voice/token
//
// Devuelve la credencial corto-viva que el navegador necesita para abrir la
// sesión de voz con la recepcionista IA, sin exponer ninguna API key nuestra.
//
// Provider switch: VOICE_PROVIDER.
//   - 'grok' (DEFAULT, decisión ago-2026): client secret efímero de xAI
//     Realtime. Es el camino vivo — ElevenLabs se descartó por coste.
//   - 'elevenlabs': signed URL del Conversational AI Agent. Se mantiene
//     entero como plan B; se activa poniendo VOICE_PROVIDER=elevenlabs.
//
// El default vive AQUÍ, en código: sin la env var el endpoint habla Grok.
// -----------------------------------------------------------------------------

const VOICE_PROVIDERS = ['grok', 'elevenlabs'] as const;
type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

const DEFAULT_VOICE_PROVIDER: VoiceProvider = 'grok';

const XAI_CLIENT_SECRETS_API = 'https://api.x.ai/v1/realtime/client_secrets';
/** Vida del client secret de xAI. Una sesión de prueba nunca dura más. */
const XAI_CLIENT_SECRET_TTL_SECONDS = 3600;

const ELEVENLABS_SIGNED_URL_API =
  'https://api.elevenlabs.io/v1/convai/conversation/get_signed_url';

function isVoiceProvider(value: string): value is VoiceProvider {
  return (VOICE_PROVIDERS as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const gate = requireFeature(access.client, 'recepcionistaIA');
  if (gate) return gate;

  const configured = process.env.VOICE_PROVIDER?.trim();
  let provider: VoiceProvider = DEFAULT_VOICE_PROVIDER;
  if (configured) {
    if (!isVoiceProvider(configured)) {
      return NextResponse.json(
        {
          error: `VOICE_PROVIDER "${configured}" no reconocido. Valores: ${VOICE_PROVIDERS.join(' | ')}.`,
        },
        { status: 500 },
      );
    }
    provider = configured;
  }

  return provider === 'elevenlabs' ? elevenLabsToken() : grokToken();
}

// -----------------------------------------------------------------------------
// Grok (xAI Realtime) — camino por defecto.
//
// Pedimos un client secret efímero con nuestra XAI_API_KEY; el navegador lo
// usa como subprotocolo al abrir wss://api.x.ai/v1/realtime.
// -----------------------------------------------------------------------------
async function grokToken() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'XAI_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const res = await fetch(XAI_CLIENT_SECRETS_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: { seconds: XAI_CLIENT_SECRET_TTL_SECONDS },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[voice/token] xAI client secret error:', res.status, text);
      return NextResponse.json(
        { error: 'No se pudo generar el client secret de voz' },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { value?: string; expires_at?: string };
    if (!data.value) {
      console.error('[voice/token] Respuesta inesperada de xAI:', data);
      return NextResponse.json({ error: 'Respuesta inválida de xAI' }, { status: 502 });
    }

    return NextResponse.json({
      provider: 'grok',
      token: data.value,
      expiresAt: data.expires_at ?? null,
    });
  } catch (err) {
    console.error('[voice/token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// -----------------------------------------------------------------------------
// ElevenLabs — plan B. No borrar: si Grok se cae o sube de precio, se vuelve
// aquí con una env var, sin desplegar código.
// -----------------------------------------------------------------------------
async function elevenLabsToken() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY no configurada' }, { status: 500 });
  }

  // Por defecto cogemos el agent global de otracita. Más adelante (Phase 2)
  // resolveremos por client.voiceId / client.elevenLabsAgentId para soportar
  // selector de voz por barbería.
  const agentId = process.env.ELEVENLABS_AGENT_ID_DEFAULT;
  if (!agentId) {
    return NextResponse.json(
      { error: 'ELEVENLABS_AGENT_ID_DEFAULT no configurado' },
      { status: 500 },
    );
  }

  try {
    const url = `${ELEVENLABS_SIGNED_URL_API}?agent_id=${encodeURIComponent(agentId)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[voice/token] ElevenLabs signed URL error:', res.status, text);
      return NextResponse.json(
        { error: 'No se pudo generar el signed URL del agent' },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) {
      console.error('[voice/token] Respuesta inesperada de ElevenLabs:', data);
      return NextResponse.json(
        { error: 'Respuesta inválida de ElevenLabs' },
        { status: 502 },
      );
    }

    // VoiceId override opcional. Si no está seteado, ElevenLabs usa la voz
    // configurada en el Agent. Cuando clients.voiceId exista (Phase 2),
    // sobrescribirá esto por cliente.
    const voiceId = process.env.ELEVENLABS_VOICE_ID_DEFAULT ?? null;

    return NextResponse.json({
      provider: 'elevenlabs',
      signedUrl: data.signed_url,
      agentId,
      voiceId,
    });
  } catch (err) {
    console.error('[voice/token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
