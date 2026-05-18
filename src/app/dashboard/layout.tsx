export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import DashboardChatWidget from "@/components/dashboard-chat-widget"
import { ConfirmDialogHost } from "./_components/ConfirmDialog"
import { UndoToastHost } from "./_components/UndoToast"
import AppRail from "@/app/dashboard/_components/AppRail"
import MobileSidebar from "@/app/dashboard/_components/MobileSidebar"
import { Wordmark } from "@/components/brand"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { eq } from "drizzle-orm"
import DashboardSidebarNav from "@/app/dashboard/_components/DashboardSidebarNav"
import { isAdminUser } from "@/lib/auth/admin"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect("/login")
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

      {/* Mobile Top Bar — hidden on lg+ */}
      <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-surface border-b border-line flex items-center justify-between px-4 lg:hidden">
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
          gestiona su PROPIO scroll interno (tabla/lista/panel). Booksy-style
          (10.06.29 / 09.46.25): header compacto fijo + área de trabajo a
          altura de pantalla, el chrome nunca se mueve. El padding de la
          barra móvil (top 14 / bottom 16) se mantiene fuera del área de
          scroll para que el header de cada surface ancle bajo la top-bar. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden pt-14 pb-16 lg:pt-0 lg:pb-0 relative">
        {/* Slot de página — flex-1 min-h-0 garantiza que toda surface
            (PageShell o wrapper propio) reciba una región de altura
            acotada para hacer su scroll interno. min-h-0 es lo que evita
            que un hijo alto fuerce scroll de la página entera. */}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </main>

      <DashboardChatWidget />
      <ConfirmDialogHost />
      <UndoToastHost />

      {/* Mobile Bottom Nav — 5 tabs principales. Sesión/admin/logout viven
          en el drawer del top-bar hamburger; no se duplican aquí. */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-line flex items-center justify-around px-2 lg:hidden">
        <DashboardSidebarNav variant="bottom" />
      </nav>

    </div>
  )
}
