import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
});

export const metadata: Metadata = {
  title: "otracita — Que no se te escape otra cita",
  description:
    "La recepcionista de IA que contesta por WhatsApp cuando tú estás cortando, cierra reservas solo, y las sincroniza con tu Booksy. Sin permanencia.",
  keywords: [
    "chatbot whatsapp",
    "reservas booksy",
    "asistente virtual",
    "agendar citas",
    "barbería reservas",
    "peluquería citas",
    "IA para negocios",
  ],
  authors: [{ name: "AI Studios" }],
  openGraph: {
    title: "otracita — Que no se te escape otra cita",
    description:
      "La recepcionista de IA que contesta por WhatsApp y sincroniza tu Booksy. Sin permanencia.",
    url: "https://otracita.es",
    siteName: "otracita",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "otracita — Que no se te escape otra cita",
    description: "Automatiza tus reservas por WhatsApp con IA.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${fraunces.variable} scroll-smooth`}
    >
      <body className="bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased selection:bg-[var(--color-brand)]/20 selection:text-[var(--color-brand-strong)]">
        {children}
      </body>
    </html>
  );
}
