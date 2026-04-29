import type { Metadata } from "next";
import { IBM_Plex_Sans, Fraunces } from "next/font/google";
import "./globals.css";

// IBM Plex Sans → body / labels / data. Cubre castellano (latin-ext) y
// trae tabular-nums por defecto. Sustituye a Inter para evitar el aire
// "Vercel template" que comentaba PRODUCT.md.
const plex = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
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
      className={`${plex.variable} ${fraunces.variable} scroll-smooth`}
    >
      <body className="bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased selection:bg-[var(--color-brand)]/20 selection:text-[var(--color-brand-strong)]">
        {children}
      </body>
    </html>
  );
}
