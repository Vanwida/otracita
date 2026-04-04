import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agendalo — El Asistente IA de Reservas por WhatsApp",
  description:
    "Tu negocio, abierto 24/7. Agendalo responde a tus clientes al instante por WhatsApp y sincroniza las reservas automáticamente con Booksy. Deja de perder ventas.",
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
    title: "Agendalo — Tu negocio responde. Automáticamente.",
    description: "El asistente IA de WhatsApp que no deja escapar ni un cliente. Sincronizado con tu calendario.",
    url: "https://agendalo.pro", // Change to URL if you have one
    siteName: "Agendalo",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agendalo — Tu negocio, 24/7.",
    description: "Automatiza tus reservas por WhatsApp con IA.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.className} scroll-smooth`}>
      <body className="bg-[#050505] text-[#FAFAFA] antialiased selection:bg-[#25D366]/30 selection:text-[#25D366]">
        {children}
      </body>
    </html>
  );
}
