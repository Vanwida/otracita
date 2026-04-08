'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Mic, MicOff, PhoneCall, PhoneOff, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type CallStatus = 'idle' | 'connecting' | 'connected' | 'error';

// ---------------------------------------------------------------------------
// PCM16 helpers
// ---------------------------------------------------------------------------

function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32(base64: string, audioCtx: AudioContext): AudioBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000;
  }
  const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
  audioBuffer.getChannelData(0).set(float32);
  return audioBuffer;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(client: ClientConfig): string {
  const barbersList =
    client.barbers.length > 0 ? client.barbers.join(', ') : 'cualquier barbero';
  const hours = `${client.hours.start} - ${client.hours.end}`;

  // Inject current date so the AI can resolve relative dates correctly
  const today = new Date().toLocaleDateString('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Internal reference list — AI uses this to map caller's answer to a service
  const serviceLines = client.services
    .map(s => `  - ${s.name} (${s.duration} min${s.price ? `, ${s.price}€` : ''})`)
    .join('\n') || '  - Corte de cabello (30 min)';

  return `You are the voice receptionist for ${client.businessName}, a barbershop. You answer calls and book appointments.

TODAY'S DATE: ${today}. Always use this to resolve day names ("el viernes", "mañana", etc.) to the correct YYYY-MM-DD. Never guess the year.

LANGUAGE: Detect whether the caller speaks Spanish or English from their FIRST message and respond in that language throughout the entire call. If unclear, default to Spanish.

YOUR JOB:
1. Greet the caller warmly
2. If they want to book: ask their name, then ask ONE simple question: "¿Es para corte, barba, o las dos?" (English: "Is it for a haircut, beard, or both?")
3. Based on their answer, silently pick the best matching service from the internal list below — NEVER read the list aloud
4. Ask for their preferred day and time
5. Use check_availability with the chosen service name to find open slots
6. Offer up to 3 available slots
7. Once they confirm, use create_booking
8. Brief confirmation and say goodbye

SERVICES (internal reference only — NEVER read this list aloud to the caller):
${serviceLines}

HOW TO MAP CALLER'S ANSWER TO A SERVICE:
- "corte" / "haircut" / "pelo" → pick the basic or most common haircut service
- "barba" / "beard" → pick the beard/barba service
- "los dos" / "corte y barba" / "both" → pick a combined corte+barba service
- Specific service name → use that one directly
- When unsure → default to the basic haircut

RULES:
- Keep every response SHORT — max 2 sentences. This is a phone call.
- NEVER list or read out services. Just ask "corte, barba, o las dos?" and map the answer internally.
- Never offer more than 3 time slots at once
- If no slots on the requested day, suggest the next available day
- Barbers available: ${barbersList}
- Business hours: ${hours}
- If the caller wants to CHANGE or CANCEL a booking: explain that you can only create new bookings, and offer to book the new slot they want. Cancellations must be done in person or by calling directly.
- Always resolve day names using TODAY'S DATE above. "El viernes" = the upcoming Friday from today's date.

EXAMPLES (Spanish):
"¡Hola! Soy la recepcionista de ${client.businessName}, ¿en qué te puedo ayudar?"
"¿Es para corte, barba, o las dos?"
"¿Para qué día te viene bien? Tengo huecos el viernes a las 11:00, 12:00 y 16:00."

EXAMPLES (English):
"Hi! This is ${client.businessName}, how can I help you?"
"Is it for a haircut, beard, or both?"
"What day works? I have openings Friday at 11:00, 12:00, and 4:00 PM."`;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function',
    name: 'check_availability',
    description:
      'Check available appointment slots. Call this when the customer asks about availability or wants to book.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        service: { type: 'string', description: 'Service name exactly as listed' },
        barber: { type: 'string', description: 'Barber name (optional)' },
      },
      required: ['date', 'service'],
    },
  },
  {
    type: 'function',
    name: 'create_booking',
    description:
      'Create a confirmed booking after customer agrees to a specific slot.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        service: { type: 'string' },
        barber: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        time: { type: 'string', description: 'HH:MM' },
      },
      required: ['customerName', 'service', 'date', 'time'],
    },
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VoiceTest({ client }: { client: ClientConfig }) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Audio playback queue
  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  // Pending tool call accumulator: call_id -> { name, args }
  const pendingCallsRef = useRef<
    Record<string, { name: string; args: string }>
  >({});

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  // ---------------------------------------------------------------------------
  // Audio playback
  // ---------------------------------------------------------------------------

  const playNextBuffer = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || playbackQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    const buffer = playbackQueueRef.current.shift()!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
      playNextBuffer();
    };
  }, []);

  const enqueueAudio = useCallback(
    (base64: string) => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const buffer = base64ToFloat32(base64, ctx);
      playbackQueueRef.current.push(buffer);
      if (!isPlayingRef.current) {
        playNextBuffer();
      }
    },
    [playNextBuffer]
  );

  // ---------------------------------------------------------------------------
  // Tool call handler
  // ---------------------------------------------------------------------------

  const handleToolCall = useCallback(
    async (name: string, callId: string, argsJson: string) => {
      let result = '';
      try {
        const args = JSON.parse(argsJson);

        if (name === 'check_availability') {
          const res = await fetch('/api/voice/availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
          });
          const data = await res.json();
          result = JSON.stringify(data);
        } else if (name === 'create_booking') {
          const res = await fetch('/api/voice/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
          });
          const data = await res.json();
          result = JSON.stringify(data);
        } else {
          result = JSON.stringify({ error: 'Unknown tool' });
        }
      } catch (err) {
        console.error('Tool call failed:', err);
        result = JSON.stringify({ error: 'Tool execution failed' });
      }

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: result,
          },
        })
      );
      ws.send(JSON.stringify({ type: 'response.create' }));
    },
    []
  );

  // ---------------------------------------------------------------------------
  // WebSocket message handler
  // ---------------------------------------------------------------------------

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const type = msg.type as string;

      switch (type) {
        // AI audio delta
        case 'response.output_audio.delta': {
          const delta = msg.delta as string | undefined;
          if (delta) enqueueAudio(delta);
          break;
        }

        // AI audio done (silence after speaking)
        case 'response.output_audio.done': {
          break;
        }

        // Transcript from AI
        case 'response.output_audio_transcript.delta': {
          const delta = msg.delta as string | undefined;
          if (delta) {
            setTranscript(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'assistant') {
                return [
                  ...prev.slice(0, -1),
                  { role: 'assistant', text: last.text + delta },
                ];
              }
              return [...prev, { role: 'assistant', text: delta }];
            });
          }
          break;
        }

        // Transcript from user (VAD detected)
        case 'conversation.item.input_audio_transcription.completed': {
          const text = msg.transcript as string | undefined;
          if (text?.trim()) {
            setTranscript(prev => [...prev, { role: 'user', text: text.trim() }]);
          }
          break;
        }

        // VAD detected user speech start
        case 'input_audio_buffer.speech_started': {
          setIsListening(true);
          // Interrupt playback queue when user starts speaking
          playbackQueueRef.current = [];
          isPlayingRef.current = false;
          nextPlayTimeRef.current = 0;
          setIsSpeaking(false);
          break;
        }

        // VAD detected user speech end
        case 'input_audio_buffer.speech_stopped': {
          setIsListening(false);
          break;
        }

        // Tool call arguments accumulation
        case 'response.function_call_arguments.delta': {
          const callId = msg.call_id as string;
          const name = msg.name as string;
          const delta = msg.delta as string;
          if (callId) {
            if (!pendingCallsRef.current[callId]) {
              pendingCallsRef.current[callId] = { name, args: '' };
            }
            pendingCallsRef.current[callId].args += delta;
          }
          break;
        }

        // Tool call complete
        case 'response.function_call_arguments.done': {
          const callId = msg.call_id as string;
          const name = msg.name as string;
          const argsStr = msg.arguments as string;
          const accumulated = pendingCallsRef.current[callId];
          const finalArgs = argsStr || accumulated?.args || '{}';
          const finalName = name || accumulated?.name || '';
          if (callId && finalName) {
            delete pendingCallsRef.current[callId];
            handleToolCall(finalName, callId, finalArgs);
          }
          break;
        }

        case 'error': {
          console.error('Grok WS error:', msg);
          setErrorMessage((msg.error as { message?: string })?.message || 'WebSocket error');
          break;
        }
      }
    },
    [enqueueAudio, handleToolCall]
  );

  // ---------------------------------------------------------------------------
  // Start call
  // ---------------------------------------------------------------------------

  const startCall = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage(null);
    setTranscript([]);
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    pendingCallsRef.current = {};

    try {
      // 1. Mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 2. AudioContext at 16 kHz for mic capture
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      // 3. Get ephemeral token
      const tokenRes = await fetch('/api/voice/token');
      if (!tokenRes.ok) {
        throw new Error('Failed to get voice token');
      }
      const { token } = await tokenRes.json();

      // 4. Open WebSocket
      const ws = new WebSocket('wss://api.x.ai/v1/realtime', [
        `xai-client-secret.${token}`,
      ]);
      wsRef.current = ws;

      ws.onmessage = handleMessage;

      ws.onerror = (e) => {
        console.error('WebSocket error', e);
        setStatus('error');
        setErrorMessage('Error de conexión con el asistente de voz.');
      };

      ws.onclose = () => {
        if (status !== 'idle') setStatus('idle');
      };

      ws.onopen = () => {
        setStatus('connected');

        // 5. Send session.update
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              model: 'grok-2-voice-agent',
              voice: 'Eve',
              instructions: buildSystemPrompt(client),
              audio: {
                input: { format: { type: 'audio/pcm', rate: 16000 } },
                output: { format: { type: 'audio/pcm', rate: 24000 } },
              },
              turn_detection: { type: 'server_vad' },
              tools: TOOLS,
              tool_choice: 'auto',
            },
          })
        );

        // 6. Start streaming mic audio
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        // ScriptProcessorNode — deprecated but widely supported
        // Buffer size 4096 gives ~256ms latency at 16kHz
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        scriptProcessorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const pcm16 = floatTo16BitPCM(float32);
          const base64 = arrayBufferToBase64(pcm16);
          ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64,
            })
          );
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };
    } catch (err) {
      console.error('Start call error:', err);
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Error al iniciar la llamada.'
      );
      // Clean up partial state
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    }
  }, [client, handleMessage, status]);

  // ---------------------------------------------------------------------------
  // Stop call
  // ---------------------------------------------------------------------------

  const stopCall = useCallback(() => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop mic
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;

    // Close AudioContext
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    // Reset playback
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    pendingCallsRef.current = {};

    setStatus('idle');
    setIsSpeaking(false);
    setIsListening(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="p-4 md:p-6 lg:p-10 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
          Recepcionista de Voz
        </h1>
        <p className="text-neutral-500 text-sm">
          Test del asistente de llamadas — {client.businessName}
        </p>
      </div>

      {/* Main card */}
      <div className="bg-[#141414] border border-[#262626] rounded-2xl overflow-hidden">
        {/* Call control */}
        <div className="p-6 md:p-8 flex flex-col items-center gap-5 border-b border-[#1f1f1f]">
          {/* Animated mic orb */}
          <div className="relative flex items-center justify-center">
            {/* Pulse rings when listening */}
            {isListening && (
              <>
                <span className="absolute inline-flex h-24 w-24 rounded-full bg-emerald-500/20 animate-ping" />
                <span className="absolute inline-flex h-20 w-20 rounded-full bg-emerald-500/10 animate-ping [animation-delay:150ms]" />
              </>
            )}
            {/* AI speaking indicator */}
            {isSpeaking && !isListening && (
              <span className="absolute inline-flex h-24 w-24 rounded-full bg-blue-500/20 animate-ping [animation-delay:0ms]" />
            )}

            <div
              className={`relative h-20 w-20 rounded-full flex items-center justify-center transition-colors duration-300 ${
                isListening
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                  : isSpeaking
                  ? 'bg-blue-500 shadow-lg shadow-blue-500/30'
                  : isConnected
                  ? 'bg-[#1f1f1f] border border-[#333]'
                  : 'bg-[#1a1a1a] border border-[#262626]'
              }`}
            >
              {isConnected ? (
                <Mic
                  className={`h-8 w-8 ${
                    isListening
                      ? 'text-white'
                      : isSpeaking
                      ? 'text-white'
                      : 'text-neutral-400'
                  }`}
                />
              ) : (
                <MicOff className="h-8 w-8 text-neutral-600" />
              )}
            </div>
          </div>

          {/* Status label */}
          <div className="flex items-center gap-2 text-sm font-medium">
            {status === 'idle' && (
              <span className="text-neutral-500">Listo para iniciar</span>
            )}
            {status === 'connecting' && (
              <>
                <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                <span className="text-emerald-400">Conectando...</span>
              </>
            )}
            {status === 'connected' && (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                <span className="text-emerald-400">
                  {isListening
                    ? 'Escuchando...'
                    : isSpeaking
                    ? 'IA hablando...'
                    : 'Conectado'}
                </span>
              </>
            )}
            {status === 'error' && (
              <>
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-red-400">Error de conexión</span>
              </>
            )}
          </div>

          {/* Error message */}
          {errorMessage && (
            <p className="text-xs text-red-400 text-center max-w-xs">{errorMessage}</p>
          )}

          {/* CTA Button */}
          {!isConnected ? (
            <button
              onClick={startCall}
              disabled={isConnecting}
              className="flex items-center gap-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors shadow-md shadow-emerald-500/20"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PhoneCall className="h-4 w-4" />
              )}
              {isConnecting ? 'Conectando...' : 'Iniciar llamada'}
            </button>
          ) : (
            <button
              onClick={stopCall}
              className="flex items-center gap-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
            >
              <PhoneOff className="h-4 w-4" />
              Colgar
            </button>
          )}
        </div>

        {/* Transcript panel */}
        <div className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Transcripción
            </p>
            {transcript.length > 0 && (
              <button
                onClick={() => setTranscript([])}
                className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          <div
            ref={transcriptRef}
            className="h-64 overflow-y-auto space-y-3 scrollbar-thin"
          >
            {transcript.length === 0 ? (
              <p className="text-neutral-700 text-sm text-center py-10">
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
                  {/* Avatar */}
                  <div
                    className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                      entry.role === 'user'
                        ? 'bg-neutral-700 text-neutral-300'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {entry.role === 'user' ? 'U' : 'IA'}
                  </div>
                  {/* Bubble */}
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      entry.role === 'user'
                        ? 'bg-[#1f1f1f] text-neutral-200 rounded-tr-none'
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 rounded-tl-none'
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
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-600">
        <span>Servicios: {client.services.map(s => s.name).join(', ') || '—'}</span>
        {client.barbers.length > 0 && (
          <span>Barbers: {client.barbers.join(', ')}</span>
        )}
        <span>Horario: {client.hours.start} – {client.hours.end}</span>
      </div>
    </div>
  );
}
