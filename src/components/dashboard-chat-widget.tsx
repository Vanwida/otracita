"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { MessageSquare, X, Send, Bot, ArrowUpRight } from "lucide-react";
import SlideOver from "@/app/dashboard/_components/SlideOver";

// -----------------------------------------------------------------------------
// Dashboard Chat Widget — Raúl (V1).
//
// Doble rol:
//   1) Soporte del producto (FAQs).
//   2) Asistente operativo: consulta datos del tenant vía tools del endpoint.
//
// UX:
//   · Botón flotante esquina inferior derecha (md+) — en móvil baja un poco
//     para no chocar con la safe-area.
//   · Click → SlideOver canónico (patrón cadena flex h-full + body overflow
//     + footer sticky).
//   · Cmd+K (Ctrl+K en Win/Linux) abre/cierra el chat. Esc cierra (lo gestiona
//     el propio SlideOver).
//   · Persistencia básica: mensajes en localStorage (last 30) hasta logout.
//
// Respuestas estructuradas (CTAs):
//   El modelo puede acabar su texto con un bloque \`\`\`actions [...]\`\`\` que
//   parseamos y renderizamos como botones de deeplink debajo del mensaje.
//   El front NO ejecuta nada: cada CTA es un <Link href> que abre la ruta
//   del panel. Nivel A (V1).
// -----------------------------------------------------------------------------

interface ChatAction {
  label: string;
  deeplink: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hola, soy Raúl, el asistente de otracita. Puedo resolverte dudas del panel o consultar datos de tu negocio (citas, ingresos, clientes...). ¿En qué te ayudo?",
};

const QUICK_REPLIES = [
  "¿Qué citas tengo hoy?",
  "¿Cuánto llevo esta semana?",
  "¿Quién no viene hace tiempo?",
  "¿Cómo activo Stripe?",
];

const STORAGE_KEY = "otracita.dashboard-chat.v1";
const MAX_PERSISTED = 30;

// Parser del bloque ```actions [...] ``` que el modelo puede añadir al final
// de su respuesta. Si lo encuentra, devuelve el texto SIN el bloque y la
// lista de acciones parseadas. Si el JSON es inválido, ignora silenciosamente
// el bloque y deja el texto tal cual (mejor texto sin botones que crash).
function parseActions(raw: string): { text: string; actions?: ChatAction[] } {
  const match = raw.match(/```actions\s*([\s\S]*?)```/i);
  if (!match) return { text: raw };
  try {
    const json = JSON.parse(match[1].trim());
    if (!Array.isArray(json)) return { text: raw };
    const actions: ChatAction[] = json
      .filter(
        (a: unknown): a is ChatAction =>
          typeof a === "object" &&
          a !== null &&
          typeof (a as ChatAction).label === "string" &&
          typeof (a as ChatAction).deeplink === "string" &&
          // sanidad: solo aceptamos paths internos del dashboard (no http://)
          (a as ChatAction).deeplink.startsWith("/"),
      )
      .slice(0, 3);
    const text = raw.replace(match[0], "").trim();
    return { text, actions: actions.length > 0 ? actions : undefined };
  } catch {
    return { text: raw };
  }
}

// Minimal Markdown renderer — solo cubrimos lo que los LLMs de tools nos
// devuelven en la práctica: **negrita**, *cursiva*, `inline code`, bullets
// con `- ` o `* `, y saltos de línea. Sin parser real ni dep externa: la
// superficie es chiquita y los inputs vienen de nuestro propio modelo
// (no se ejecuta HTML del usuario). React escapa el resto.
function renderInlineMd(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Tokenizamos por **bold**, *italic*, `code`. Ordenado para que **
  // gane a * (greedy en este orden de regex).
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(text.slice(lastIndex, m.index));
    }
    if (m[2] !== undefined) {
      out.push(
        <strong key={`b-${key++}`} className="font-semibold">
          {m[2]}
        </strong>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <em key={`i-${key++}`} className="italic">
          {m[3]}
        </em>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-canvas border border-line px-1 py-0.5 text-[0.85em] font-mono"
        >
          {m[4]}
        </code>,
      );
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}

function renderAssistantContent(raw: string): React.ReactNode {
  // Split en líneas y agrupa bullets contiguos en un <ul>. Es lo mínimo
  // que necesitamos para que respuestas como "- Marta: 10:00\n- Juan: 12:00"
  // no se vean con guiones literales.
  const lines = raw.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let blockKey = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets.map((b, i) => (
      <li key={i}>{renderInlineMd(b)}</li>
    ));
    blocks.push(
      <ul key={`ul-${blockKey++}`} className="list-disc pl-5 space-y-0.5">
        {items}
      </ul>,
    );
    bullets = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      continue;
    }
    flushBullets();
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${blockKey++}`} className="h-1" />);
    } else {
      blocks.push(<p key={`p-${blockKey++}`}>{renderInlineMd(line)}</p>);
    }
  }
  flushBullets();
  return <>{blocks}</>;
}

function loadHistory(): Message[] {
  if (typeof window === "undefined") return [INITIAL_MESSAGE];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [INITIAL_MESSAGE];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [INITIAL_MESSAGE];
    return parsed;
  } catch {
    return [INITIAL_MESSAGE];
  }
}

function saveHistory(messages: Message[]) {
  if (typeof window === "undefined") return;
  try {
    // Conserva solo los últimos N — el contexto del LLM ya filtra el resto.
    const tail = messages.slice(-MAX_PERSISTED);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tail));
  } catch {
    // localStorage lleno o bloqueado — fallar en silencio, el chat sigue
    // funcionando solo en memoria.
  }
}

export default function DashboardChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Anti-race: si por cualquier motivo se dispara un segundo envío antes
  // de que vuelva el primero (timeout de proxy, click rápido en un quick
  // reply, etc.), cancelamos el request en vuelo y solo aceptamos la
  // respuesta del último `turnId`. Sin esto vimos respuestas asociadas
  // al turno equivocado: la respuesta de "cuántas citas hoy" llegaba
  // DESPUÉS de mandar "hola" y se pegaba como respuesta a "hola".
  const turnIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Hydrate desde localStorage en cliente — evita mismatch SSR.
  useEffect(() => {
    setMessages(loadHistory());
    setHydrated(true);
  }, []);

  // Persiste cambios después de hydrate.
  useEffect(() => {
    if (hydrated) saveHistory(messages);
  }, [messages, hydrated]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Cmd+K (mac) / Ctrl+K (Win/Linux) → toggle del chat. Captura en window
  // para ganar a cualquier handler de página. preventDefault para evitar
  // el atajo nativo del navegador (Firefox lo usa para search bar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      // Cancelamos cualquier request en vuelo y avanzamos el turno. Solo la
      // respuesta del turno actual será aceptada.
      abortRef.current?.abort();
      const myTurn = ++turnIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: Message = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setIsTyping(true);

      const FALLBACK_ERROR =
        "Algo ha fallado, vuelve a intentarlo. Si sigue sin responder, avisa a soporte.";

      const pushIfCurrent = (msg: Message) => {
        if (turnIdRef.current !== myTurn) return; // turno superado
        setMessages((prev) => [...prev, msg]);
      };

      try {
        const res = await fetch("/api/dashboard-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            // El backend solo necesita role + content. Las actions parseadas
            // viven solo en el front (no influyen en el siguiente turno).
            messages: updatedMessages.map(({ role, content }) => ({
              role,
              content,
            })),
          }),
        });
        if (turnIdRef.current !== myTurn) return; // request ganador es otro
        const data = await res.json().catch(() => null);
        if (turnIdRef.current !== myTurn) return;
        // Guard: HTTP no-ok, payload inválido, o message vacío/no-string →
        // mostramos error legible en lugar de burbuja fantasma.
        const rawMessage =
          data && typeof data.message === "string" ? data.message.trim() : "";
        if (!res.ok || !rawMessage) {
          pushIfCurrent({ role: "assistant", content: FALLBACK_ERROR });
          return;
        }
        const { text: cleanText, actions } = parseActions(rawMessage);
        // Si el parser deja el texto vacío (caso degenerado: solo había un
        // bloque ```actions``` sin texto), forzamos fallback también.
        const finalText = cleanText.trim() ? cleanText : FALLBACK_ERROR;
        pushIfCurrent({ role: "assistant", content: finalText, actions });
      } catch (err) {
        // AbortError es esperado cuando otro envío reemplaza este → no pintamos.
        if (err instanceof Error && err.name === "AbortError") return;
        pushIfCurrent({ role: "assistant", content: FALLBACK_ERROR });
      } finally {
        if (turnIdRef.current === myTurn) setIsTyping(false);
      }
    },
    [messages, isTyping],
  );

  const showQuickReplies = useMemo(
    () => messages.length === 1 && messages[0].role === "assistant",
    [messages],
  );

  return (
    <>
      {/* Botón flotante — siempre visible en el dashboard. Mismo z que el
          SlideOver (z-50). El SlideOver pintará por encima cuando esté
          abierto y el scrim tapará este botón en mobile (md:hidden del
          SlideOver default). */}
      <motion.button
        type="button"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.5 }}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Abrir asistente Raúl"
        title="Asistente (Cmd+K)"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg transition-all hover:bg-brand-strong hover:scale-105"
        style={{ marginBottom: "var(--safe-bottom, 0px)" }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-5 w-5" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageSquare className="h-5 w-5" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <SlideOver
        open={isOpen}
        onClose={() => setIsOpen(false)}
        ariaLabel="Asistente Raúl"
      >
        {/* Header custom (no usamos title= para meter avatar + estado). */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0 bg-overlay">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-softer border border-brand/20">
              <Bot className="h-4 w-4 text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Raúl</p>
              <p className="text-[11px] text-ink-3">
                Asistente otracita · Cmd+K
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Cerrar"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface text-ink-3 hover:text-ink-2 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — overflow-y-auto. Header + footer son shrink-0. */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-canvas">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[85%] space-y-2">
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed space-y-1 ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-brand text-brand-ink"
                      : "rounded-bl-sm bg-surface border border-line text-ink"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    renderAssistantContent(msg.content)
                  ) : (
                    msg.content.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))
                  )}
                </div>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {msg.actions.map((a, j) => (
                      <Link
                        key={j}
                        href={a.deeplink}
                        onClick={() => setIsOpen(false)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-softer px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/15"
                      >
                        {a.label}
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="flex gap-1.5 rounded-2xl rounded-bl-sm bg-surface border border-line px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-ink-3 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-ink-3 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-ink-3 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {showQuickReplies && (
            <div className="flex flex-wrap gap-2 pt-1">
              {QUICK_REPLIES.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => sendMessage(text)}
                  disabled={isTyping}
                  className="rounded-full border border-brand/30 bg-brand-softer px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer sticky con el input. shrink-0 + border-t aislado. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2 border-t border-line bg-surface px-3 py-3 shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta lo que necesites..."
            className="flex-1 rounded-full bg-canvas border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-3 outline-none transition-all focus:border-brand"
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition-all hover:bg-brand-strong disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </SlideOver>
    </>
  );
}
