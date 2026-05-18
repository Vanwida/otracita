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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 pb-16 lg:pt-0 lg:pb-0 relative">
        {children}
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
