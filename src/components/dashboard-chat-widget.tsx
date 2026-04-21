"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Bot } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  content: "Hola 👋 Soy el asistente de soporte de otracita. ¿En qué puedo ayudarte?",
};

const QUICK_REPLIES = [
  "¿Cómo conecto Booksy?",
  "No llegan mensajes al bot",
  "¿Cómo cambio mi plan?",
];

export default function DashboardChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping) return;

      const userMessage: Message = { role: "user", content: trimmed };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setIsTyping(true);

      try {
        const res = await fetch("/api/dashboard-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          }),
        });
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message || "No he podido responder. Inténtalo de nuevo." },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error de conexión. Inténtalo de nuevo." },
        ]);
      } finally {
        setIsTyping(false);
      }
    },
    [messages, isTyping]
  );

  const showQuickReplies = messages.length === 1;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg"
            style={{ width: "min(360px, calc(100vw - 3rem))", height: "min(480px, calc(100dvh - 8rem))" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line bg-overlay px-4 py-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-softer border border-brand/20">
                  <Bot className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Soporte otracita</p>
                  <p className="text-[11px] text-success font-medium">IA · Online</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-3 hover:bg-overlay hover:text-ink transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-br-sm bg-brand text-brand-ink"
                        : "rounded-bl-sm bg-overlay border border-line text-ink"
                    }`}
                  >
                    {msg.content.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="flex gap-1.5 rounded-2xl rounded-bl-sm bg-overlay border border-line px-4 py-3">
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
                      onClick={() => sendMessage(text)}
                      className="rounded-full border border-brand/30 bg-brand-softer px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/15"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
              className="flex items-center gap-2 border-t border-line bg-overlay px-3 py-3 shrink-0"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                className="flex-1 rounded-full bg-surface border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-3 outline-none transition-all focus:border-brand"
                disabled={isTyping}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition-all hover:bg-brand-strong disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.5 }}
        onClick={() => setIsOpen((v) => !v)}
        className="relative flex h-13 w-13 h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg transition-all hover:bg-brand-strong hover:scale-105"
        aria-label="Soporte"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-5 w-5" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageSquare className="h-5 w-5" />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Unread dot */}
        {!isOpen && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
          </span>
        )}
      </motion.button>
    </div>
  );
}
