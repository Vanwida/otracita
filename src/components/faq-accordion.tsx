"use client";

import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: "¿Necesito cambiar de Booksy o Google Calendar?",
    answer:
      "No. Seguirás usando Booksy como siempre. Nosotros simplemente conectamos tu WhatsApp con tu calendario para que el chatbot sepa cuándo tienes hueco y agende en piloto automático.",
  },
  {
    question:
      "¿Qué pasa si un cliente reserva por Booksy y otro por WhatsApp a la misma hora?",
    answer:
      "El calendario está sincronizado en tiempo real. Si un hueco se ocupa por la app de Booksy, el chatbot ya no lo ofrece por WhatsApp.",
  },
  {
    question: "¿Y si no sé conectar Booksy a Google Calendar?",
    answer:
      "No te preocupes. Nuestro equipo experto te hace la configuración inicial totalmente gratis.",
  },
  {
    question: "¿Puedo probarlo antes?",
    answer:
      "Escríbenos por WhatsApp y te hacemos una demostración interactiva en directo.",
  },
  {
    question: "¿Tiene permanencia?",
    answer:
      "Ninguna. Puedes cancelar en 1 solo click si crees que el sistema no te aporta valor (aunque si salvas 1 o 2 clientes al mes, ya te sale rentable).",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-2xl divide-y divide-white/[0.05]">
      {faqs.map((faq, index) => (
        <div key={index}>
          <button
            onClick={() =>
              setOpenIndex(openIndex === index ? null : index)
            }
            className="flex w-full items-center justify-between py-6 text-left text-lg font-medium text-white transition-colors hover:text-emerald-400 group"
          >
            <span className="pr-4 tracking-tight drop-shadow-sm group-hover:drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">{faq.question}</span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400 transition-all group-hover:border-emerald-500/30 group-hover:text-emerald-400">
              {openIndex === index ? "−" : "+"}
            </span>
          </button>
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
              openIndex === index
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <p className="pb-6 pr-4 text-gray-400 leading-relaxed text-[15px]">
                {faq.answer}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
