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
  title: "otracita · Tu barbería en una app",
  description:
    "Agenda, bot de WhatsApp, TPV, factura VeriFactu y fidelidad en una sola app. Pagas mes a mes, sin permanencia, sin comisión por reserva.",
  keywords: [
    "agenda barbería",
    "software barbería",
    "VeriFactu barbería",
    "facturación barbería",
    "TPV barbería",
    "Tap to Pay iPhone barbería",
    "WhatsApp reservas",
    "recepcionista IA barbería",
  ],
  authors: [{ name: "otracita" }],
  openGraph: {
    title: "otracita · Tu barbería en una app",
    description:
      "Cinco herramientas en una. Reservas, agenda, cobro, factura VeriFactu y fidelidad.",
    url: "https://otracita.es",
    siteName: "otracita",
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "otracita · Tu barbería en una app",
    description:
      "Cinco herramientas en una. Pagas mes a mes, sin permanencia.",
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
      <head>
        {/* Boska (display) + General Sans (body) servidos por Fontshare. Solo
         * los usa la landing y otras superficies brand-register; el dashboard
         * sigue con IBM Plex Sans + Fraunces. La carga es liviana y permite
         * que ambos sistemas convivan sin migrar todo en este sprint. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=boska@500,600,700,500i,600i,700i&f[]=general-sans@400,500,600,700&display=swap"
        />
      </head>
      <body className="bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased selection:bg-[var(--color-brand)]/20 selection:text-[var(--color-brand-strong)]">
        {children}
      </body>
    </html>
  );
}
