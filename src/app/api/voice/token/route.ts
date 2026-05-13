import { NextRequest, NextResponse } from 'next/server';
import { requireClientAccess, accessErrorResponse } from '@/lib/auth/require-client-access';
import { requireFeature } from '@/lib/billing/tier';

// -----------------------------------------------------------------------------
// GET /api/voice/token
//
// Devuelve un signed URL corto-vivo para conectar al Conversational AI Agent
// de ElevenLabs (recepcionista IA). El cliente usa esta URL para abrir la
// conexión WebSocket directamente desde el navegador, sin exponer la API key.
//
// Migrado de Grok Realtime → ElevenLabs Conversational AI el 2026-05-01:
//   - Voz castellana nativa real (vs. acento inglés-traducido en Grok)
//   - SDK abstrae WebSocket / PCM / VAD / playback (vs. 700 LOC manuales)
//   - Pricing similar ($0.05/min Grok vs $0.08/min ElevenLabs Standard)
//
// Provider switch: VOICE_PROVIDER env var. Por defecto 'elevenlabs'. Si se
// pone 'grok' caemos al flujo legacy (no soportado tras este refactor; queda
// como tombstone para rollback rápido si fuera necesario).
// -----------------------------------------------------------------------------

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/convai/conversation/get_signed_url';

export async function GET(req: NextRequest) {
  const access = await requireClientAccess(req);
  if (!access.ok) return accessErrorResponse(access);
  const gate = requireFeature(access.client, 'recepcionistaIA');
  if (gate) return gate;

  const provider = process.env.VOICE_PROVIDER ?? 'elevenlabs';
  if (provider !== 'elevenlabs') {
    return NextResponse.json(
      { error: `Voice provider "${provider}" no soportado. Usa 'elevenlabs'.` },
      { status: 500 },
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY no configurada' },
      { status: 500 },
    );
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
    const url = `${ELEVENLABS_API}?agent_id=${encodeURIComponent(agentId)}`;
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
