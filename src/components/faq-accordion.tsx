"use client";

import { useState } from "react";

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: "¿Necesito cambiar mi app de reservas actual?",
    answer:
      "No. Seguirás usándola como siempre — nosotros conectamos tu WhatsApp con tu agenda para que el bot sepa cuándo tienes hueco y reserve en piloto automático. Si quieres, con el tiempo puedes dejar la otra: nuestra agenda + facturación + cobros lo cubren entero.",
  },
  {
    question: "¿Cómo funciona la facturación para mi gestor?",
    answer:
      "Cada reserva confirmada con precio genera automáticamente un ticket (o factura completa si el cliente aporta NIF). A fin de mes descargas el Libro de Facturas Emitidas en PDF y un Excel gestor-friendly con IVA desglosado. Lo adjuntas al email de tu gestor y listo para el Modelo 303.",
  },
  {
    question: "¿Puedo cobrar con tarjeta sin tener datáfono?",
    answer:
      "Sí — opcional. Activas los cobros online en 10 minutos (Stripe gestiona el KYC), y desde la agenda puedes generar un QR para cualquier cita. El cliente escanea con su móvil, paga con tarjeta o Apple Pay, y el dinero va directo a tu banco. Si ya tienes datáfono propio, lo ignoras y sigues como siempre.",
  },
  {
    question: "¿Y si un cliente no se presenta y ya había factura emitida?",
    answer:
      "Marcas la reserva como no-show con un click y automáticamente se anula la factura. El dato no cuenta en tus exports al gestor. Todo limpio.",
  },
  {
    question: "¿Qué pasa si un cliente reserva por tu otra app y otro por WhatsApp a la misma hora?",
    answer:
      "El calendario está sincronizado. Si un hueco se ocupa por el otro lado, el bot deja de ofrecerlo por WhatsApp al instante — cero dobles reservas.",
  },
  {
    question: "¿Y si no sé conectar mi agenda actual?",
    answer:
      "No te preocupes. Nuestro equipo te hace la configuración inicial totalmente gratis — Meta WhatsApp + sync con tu agenda + primer test. En menos de 48h estás activo.",
  },
  {
    question: "¿Puedo probarlo antes?",
    answer:
      "Escríbenos por WhatsApp y te hacemos una demo en directo. Ves exactamente cómo respondería a tus clientes y cómo se vería tu panel.",
  },
  {
    question: "¿Tiene permanencia?",
    answer:
      "Ninguna. Cancelas desde el panel en 1 click cuando quieras. Si salvas 1 o 2 clientes al mes, ya te sale rentable.",
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-2xl divide-y divide-[var(--color-line)]">
      {faqs.map((faq, index) => (
        <div key={index}>
          <button
            onClick={() =>
              setOpenIndex(openIndex === index ? null : index)
            }
            className="flex w-full items-center justify-between py-6 text-left text-lg font-medium text-[var(--color-ink)] transition-colors hover:text-[var(--color-brand)] group"
          >
            <span className="pr-4 tracking-tight">{faq.question}</span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-2)] transition-all group-hover:border-[var(--color-brand)] group-hover:text-[var(--color-brand)]">
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
              <p className="pb-6 pr-4 text-[var(--color-ink-2)] leading-relaxed text-[15px]">
                {faq.answer}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
