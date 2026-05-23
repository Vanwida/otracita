export const dynamic = 'force-dynamic'

import type { Metadata, Viewport } from "next"
import { auth } from "@/lib/auth/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Toaster } from "sonner"
import DashboardChatWidget from "@/components/dashboard-chat-widget"
import { ConfirmDialogHost } from "./_components/ConfirmDialog"
import { UndoToastHost } from "./_components/UndoToast"
import AppRail from "@/app/dashboard/_components/AppRail"
import MobileSidebar from "@/app/dashboard/_components/MobileSidebar"
import DashboardPwaBootstrap from "@/app/dashboard/_components/DashboardPwaBootstrap"
import AdminLockHeartbeat from "@/app/dashboard/_components/AdminLockHeartbeat"
import { Wordmark } from "@/components/brand"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { isAdminUser } from "@/lib/auth/admin"
import { users } from "@/db/schema"

// PWA del dashboard — instalable en iPad/iPhone/Android desde el propio
// /dashboard. El manifest vive en /dashboard/manifest.webmanifest (scope
// `/dashboard`, start_url `/dashboard`) y el service worker en
// /dashboard/sw.js (registrado por DashboardPwaBootstrap solo en prod).
//
// `apple-mobile-web-app-*` y `apple-touch-icon` son necesarios para que
// iOS Safari trate el dashboard como standalone app al añadirlo a la
// pantalla de inicio — sin estos, abriría en Safari normal con barra de
// direcciones.
export const metadata: Metadata = {
  title: 'otracita · Dashboard',
  manifest: '/dashboard/manifest.webmanifest',
  applicationName: 'otracita',
  appleWebApp: {
    capable: true,
    title: 'otracita',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/dashboard-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/dashboard-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/dashboard-icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

// `theme_color` específico del dashboard (terracota de marca). Pinta la
// barra de estado en Android Chrome y el chrome de la PWA standalone.
// En el root layout sigue siendo el cream del lienzo público.
export const viewport: Viewport = {
  themeColor: '#C9653C',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect("/login")
  }

  // Modo barbero v2 (#71) — si el user tiene role='barber', su sitio NO
  // es el dashboard sino /yo. Resolvemos a DB (los additionalFields de
  // Better Auth pueden no estar en el objeto session según versión).
  const [userRow] = await db.select().from(users).where(eq(users.id, session.user.id))
  if (userRow?.disabledAt) {
    redirect("/login?error=disabled")
  }
  if (userRow?.role === 'barber') {
    redirect("/yo/agenda")
  }

  let client = null
  if (session.user.email) {
    const records = await db.select().from(clients).where(eq(clients.email, session.user.email))
    client = records[0] || null
  }

  const needsSetup = !client || client.status === 'pending'
  const email = session.user.email || ''
  const isAdmin = isAdminUser(session)

  return (
    <div className="flex h-screen bg-canvas text-ink overflow-hidden">

      {/* Mobile Top Bar — hidden on md+ (iPad bumps a desktop-compact: rail
          visible desde 768px). Antes era lg+ (1024px) lo que dejaba iPad
          portrait en modo mobile-stack; tablet POS = desktop, no mobile.
          Altura y offsets vienen de tokens `--mobile-topbar-*` (globals.css)
          — fuente única; cambiar el alto del shell se hace allí. */}
      <div
        className="fixed top-0 left-0 right-0 z-40 bg-surface border-b border-line flex items-center justify-between px-4 md:hidden"
        style={{
          paddingTop: 'var(--safe-top)',
          height: 'var(--mobile-topbar-offset)',
        }}
      >
        <Link href="/dashboard" className="flex items-center text-ink">
          <Wordmark height={28} />
        </Link>
        <MobileSidebar email={email} isAdmin={isAdmin} needsSetup={needsSetup} />
      </div>

      {/* Nivel-1 nav: rail de iconos (UI0). Sustituye al <aside w-60>
          editorial. Chrome extraído a AppRail para que el layout sea
          puro ensamblador. */}
      <AppRail email={email} isAdmin={isAdmin} needsSetup={needsSetup} />

      {/* Main Content — región viewport-locked. NO scrollea como artículo:
          es flex column con overflow-hidden; cada superficie es h-full y
          gestiona su PROPIO scroll interno (tabla/lista/panel). Booksy-style:
          header compacto fijo + área de trabajo a altura de pantalla.
          Mobile: padding-top reserva la top-bar (top-bar es fixed). NO hay
          bottom-nav en mobile — toda la navegación vive en el drawer del
          burger (decisión Alex: 2 menús apilados era confuso y no cabía en
          375px sin scroll horizontal). pb solo respeta el home-indicator
          via safe-area. md+ anula ambos (no hay shell mobile). */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative pt-[var(--mobile-topbar-offset)] pb-[var(--safe-bottom)] md:pt-0 md:pb-0">
        {/* Slot de página — flex-1 min-h-0 garantiza que toda surface
            (PageShell o wrapper propio) reciba una región de altura
            acotada para hacer su scroll interno. min-h-0 es lo que evita
            que un hijo alto fuerce scroll de la página entera. */}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </main>

      <DashboardChatWidget />
      <ConfirmDialogHost />
      <UndoToastHost />
      <DashboardPwaBootstrap />
      <AdminLockHeartbeat />

      {/* Toaster sonner — feedback post-save canónico para todo el dashboard.
          richColors aporta tinte success/error sobre tokens del theme.
          closeButton añade ✕ accesible. Posición bottom-right para no chocar
          con UndoToastHost (bottom-center). Duration default 3s. */}
      <Toaster
        richColors
        closeButton
        position="bottom-right"
        duration={3000}
        toastOptions={{
          classNames: {
            toast: 'rounded-xl border border-line shadow-warm-strong',
          },
        }}
      />

    </div>
  )
}
