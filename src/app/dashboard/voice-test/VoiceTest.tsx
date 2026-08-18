'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneCall, PhoneOff, Loader2 } from 'lucide-react';
import { useConversation, ConversationProvider } from '@elevenlabs/react';

// -----------------------------------------------------------------------------
// Recepcionista IA voice-test (ElevenLabs Conversational AI)
//
// Migrado el 2026-05-01 de Grok Realtime (~700 LOC manuales de WebSocket /
// PCM / VAD / playback) a @elevenlabs/react useConversation hook. El SDK
// abstrae todo el plumbing: signed URL → conexión → mic → audio → transcript
// → end. Aquí solo gestionamos UI y callbacks.
//
// Voz castellana nativa real (vs acento inglés-traducido de Grok). Selector
// de voz por cliente vendrá en Phase 2 (cuando varios barberos quieran
// elegir entre JeiJo / Dante / etc).
// -----------------------------------------------------------------------------

interface ServiceConfig {
  name: string;
  duration: number;
  price?: number;
}

interface BusinessHours {
  start: string;
  end: string;
}

interface ClientConfig {
  businessName: string;
  services: ServiceConfig[];
  barbers: string[];
  hours: BusinessHours;
}

interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

// Wrapper que monta el ConversationProvider del SDK. El hook
// useConversation() solo funciona dentro de este provider, por eso
// envolvemos aquí en lugar de pedirle al consumer que lo haga.
export default function VoiceTest({ client }: { client: ClientConfig }) {
  return (
    <ConversationProvider>
      <VoiceTestInner client={client} />
    </ConversationProvider>
  );
}

function VoiceTestInner({ client }: { client: ClientConfig }) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Hook del SDK. Maneja toda la conexión WS, audio, VAD internamente.
  // Los callbacks nos dan el output que necesitamos para la UI.
  const conversation = useConversation({
    onConnect: () => {
      setConnecting(false);
      setErrorMessage(null);
    },
    onDisconnect: () => {
      setConnecting(false);
    },
    onMessage: (msg: { source: 'user' | 'ai'; message: string }) => {
      // El SDK emite 'user' y 'ai' (no 'assistant'); normalizamos a la
      // shape que ya usaba el componente original.
      const role: 'user' | 'assistant' = msg.source === 'ai' ? 'assistant' : 'user';
      const text = msg.message?.trim();
      if (!text) return;
      setTranscript((prev) => {
        // Si el último mensaje es del mismo rol, lo concatenamos (deltas).
        const last = prev[prev.length - 1];
        if (last?.role === role) {
          return [...prev.slice(0, -1), { role, text: `${last.text} ${text}`.trim() }];
        }
        return [...prev, { role, text }];
      });
    },
    onError: (err: unknown) => {
      console.error('[voice-test] ElevenLabs error:', err);
      const message =
        typeof err === 'object' && err && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Error en el asistente de voz';
      setErrorMessage(message);
      setConnecting(false);
    },
  });

  const status = conversation.status; // 'disconnected' | 'connecting' | 'connected' | 'disconnecting'
  const isSpeaking = conversation.isSpeaking;
  const isConnected = status === 'connected';

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // ---------------------------------------------------------------------------
  // Start call: pide permiso de micro + signed URL al backend + abre sesión.
  // ---------------------------------------------------------------------------
  const startCall = useCallback(async () => {
    setConnecting(true);
    setErrorMessage(null);
    setTranscript([]);

    try {
      // 1. Permiso de micrófono (requerido por el SDK aunque él no lo pida).
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // 2. Backend: signed URL del agent ElevenLabs (corto-vivo, no expone
      //    nuestra API key al navegador).
      const tokenRes = await fetch('/api/voice/token');
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${tokenRes.status}`);
      }
      const { provider, signedUrl, voiceId } = (await tokenRes.json()) as {
        provider?: string;
        signedUrl?: string;
        voiceId?: string | null;
      };

      // El backend habla Grok por defecto (VOICE_PROVIDER). Esta pantalla
      // sigue montada sobre el SDK de ElevenLabs, así que sólo sabe arrancar
      // el plan B. Falla claro en vez de abrir una sesión sin signedUrl.
      if (provider !== 'elevenlabs' || !signedUrl) {
        throw new Error(
          `La prueba en navegador todavía usa ElevenLabs; el backend responde "${provider ?? 'desconocido'}". Pon VOICE_PROVIDER=elevenlabs para probar aquí.`,
        );
      }

      // 3. SDK: arranca sesión. A partir de aquí los callbacks de useConversation
      //    gestionan transcript / audio / errores. Si el backend mandó voiceId,
      //    se lo pasamos como override TTS para no depender de la voz que
      //    esté configurada en el Agent (más fácil cambiar voz vía env var
      //    o, en Phase 2, vía clients.voiceId).
      await conversation.startSession({
        signedUrl,
        ...(voiceId
          ? { overrides: { tts: { voiceId } } }
          : {}),
      });
    } catch (err) {
      console.error('[voice-test] startCall error:', err);
      setErrorMessage(
        err instanceof Error ? err.message : 'No se pudo iniciar la llamada.',
      );
      setConnecting(false);
    }
  }, [conversation]);

  // ---------------------------------------------------------------------------
  // Stop call
  // ---------------------------------------------------------------------------
  const stopCall = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (err) {
      console.error('[voice-test] endSession error:', err);
    }
  }, [conversation]);

  // Cleanup on unmount. Cast a unknown porque el SDK declara endSession()
  // como void en los .d.ts pero en runtime devuelve una Promise.
  useEffect(() => {
    return () => {
      try {
        const result = conversation.endSession() as unknown as Promise<unknown> | void;
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).catch(() => {});
        }
      } catch {
        // swallow
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-canvas">
    <div className="max-w-2xl mx-auto" style={{ padding: 'var(--space-page)' }}>
      {/* Header */}
      <div
        className="border-b border-line"
        style={{ paddingBottom: 'var(--space-card)', marginBottom: 'var(--space-section)' }}
      >
        <h1
          className="font-semibold text-ink leading-tight mb-0.5"
          style={{ fontSize: 'var(--text-page-title)' }}
        >
          Recepcionista de Voz
        </h1>
        <p className="text-ink-2 text-sm">
          Test del asistente de llamadas — {client.businessName}
        </p>
      </div>

      {/* Main card */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        {/* Call control */}
        <div className="p-6 md:p-8 flex flex-col items-center gap-5 border-b border-line">
          {/* Animated mic orb */}
          <div className="relative flex items-center justify-center">
            {isSpeaking && isConnected && (
              <span className="absolute inline-flex h-24 w-24 rounded-full bg-brand/20 animate-ping" />
            )}
            <div
              className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-colors duration-300 ${
                isSpeaking && isConnected
                  ? 'bg-brand shadow-lg'
                  : isConnected
                    ? 'bg-success shadow-lg'
                    : 'bg-overlay border border-line'
              }`}
            >
              {isConnected ? (
                <Mic
                  className={`h-8 w-8 ${
                    isSpeaking ? 'text-brand-ink' : 'text-brand-ink'
                  }`}
                />
              ) : (
                <MicOff className="h-8 w-8 text-ink-3" />
              )}
            </div>
          </div>

          {/* Status label */}
          <div className="flex items-center gap-2 text-sm font-medium">
            {status === 'disconnected' && !connecting && (
              <span className="text-ink-2">Listo para iniciar</span>
            )}
            {(connecting || status === 'connecting') && (
              <>
                <Loader2 className="h-4 w-4 text-brand animate-spin" />
                <span className="text-brand">Conectando...</span>
              </>
            )}
            {status === 'connected' && (
              <>
                <span className="h-2 w-2 rounded-full bg-success shadow-sm" />
                <span className="text-success">
                  {isSpeaking ? 'IA hablando...' : 'Escuchando'}
                </span>
              </>
            )}
          </div>

          {/* Error message */}
          {errorMessage && (
            <p className="text-xs text-danger text-center max-w-xs">
              {errorMessage}
            </p>
          )}

          {/* CTA Button */}
          {!isConnected && status !== 'connecting' ? (
            <button
              onClick={startCall}
              disabled={connecting}
              className="btn-primary shadow-md"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneCall className="h-4 w-4" />
              )}
              {connecting ? 'Conectando...' : 'Iniciar llamada'}
            </button>
          ) : (
            <button
              onClick={stopCall}
              className="flex items-center gap-2.5 bg-danger/10 hover:bg-danger/15 border border-danger/30 text-danger font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              <PhoneOff className="h-4 w-4" />
              Colgar
            </button>
          )}
        </div>

        {/* Transcript panel */}
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-ink-2 uppercase tracking-wider">
              Transcripción
            </p>
            {transcript.length > 0 && (
              <button
                onClick={() => setTranscript([])}
                className="text-xs text-ink-3 hover:text-ink-2 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          <div ref={transcriptRef} className="h-64 overflow-y-auto space-y-3 scrollbar-thin">
            {transcript.length === 0 ? (
              <p className="text-ink-3 text-sm text-center py-10">
                La conversación aparecerá aquí...
              </p>
            ) : (
              transcript.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 ${
                    entry.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                      entry.role === 'user'
                        ? 'bg-overlay border border-line text-ink-2'
                        : 'bg-brand-softer border border-brand/30 text-brand'
                    }`}
                  >
                    {entry.role === 'user' ? 'U' : 'IA'}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      entry.role === 'user'
                        ? 'bg-overlay border border-line text-ink rounded-tr-none'
                        : 'bg-brand-softer border border-brand/30 text-ink rounded-tl-none'
                    }`}
                  >
                    {entry.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-3">
        <span>Servicios: {client.services.map((s) => s.name).join(', ') || '—'}</span>
        {client.barbers.length > 0 && <span>Barberos: {client.barbers.join(', ')}</span>}
        <span>
          Horario: {client.hours.start} – {client.hours.end}
        </span>
      </div>
    </div>
    </div>
  );
}
