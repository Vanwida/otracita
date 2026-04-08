export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard, Settings, LogOut, MessageSquare, Wrench, Shield, Calendar } from "lucide-react"
import DashboardChatWidget from "@/components/dashboard-chat-widget"
import MobileSidebar from "@/app/dashboard/_components/MobileSidebar"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { eq } from "drizzle-orm"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect("/login")
  }

  // Check client status to decide if they need setup
  let client = null
  if (session.user.email) {
    const records = await db.select().from(clients).where(eq(clients.email, session.user.email))
    client = records[0] || null
  }

  const needsSetup = !client || client.status === 'pending'
  const email = session.user.email || ''
  const isAdmin = email === 'vanwida@aistudios.pro' || email.endsWith('@aistudios.pro') || email.toLowerCase().includes('alex')

  return (
    <div className="flex h-screen bg-canvas text-neutral-100 overflow-hidden">

      {/* Mobile Top Bar — hidden on lg+ */}
      <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-surface border-b border-line flex items-center justify-between px-4 lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Agendalo" className="h-7 w-7" />
          <span className="font-bold text-ink text-base tracking-wide">Agendalo</span>
        </Link>
        <MobileSidebar email={email} isAdmin={isAdmin} needsSetup={needsSetup} />
      </div>

      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <aside className="hidden lg:flex lg:flex-col w-60 border-r border-sidebar-line bg-sidebar p-5 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 mb-8">
          <img src="/logo.svg" alt="Agendalo" className="h-7 w-7" />
          <span className="font-bold text-white text-base tracking-wide">Agendalo</span>
        </Link>

        <nav className="flex-1 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <LayoutDashboard className="h-4 w-4" />
            Vista General
          </Link>
          <Link
            href="/dashboard/calendar"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <Calendar className="h-4 w-4" />
            Calendario
          </Link>
          <Link
            href="/dashboard/setup"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <Wrench className="h-4 w-4" />
            Configuración Inicial
          </Link>
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <Settings className="h-4 w-4" />
            Ajustes del Bot
          </Link>
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-neutral-600 cursor-not-allowed">
            <MessageSquare className="h-4 w-4" />
            Chats (Pronto)
          </div>

          {isAdmin && (
            <div className="pt-3 mt-4 border-t border-sidebar-line">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg border border-sidebar-line px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-white hover:bg-sidebar-hover hover:border-sidebar-text transition-colors"
              >
                <Shield className="h-4 w-4" />
                <span className="font-semibold">Panel Admin</span>
              </Link>
            </div>
          )}
        </nav>

        {needsSetup && (
          <div className="bg-sidebar-card border border-sidebar-line rounded-xl p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-500 mb-1">Setup Inicial</p>
            <p className="text-xs text-neutral-500 leading-relaxed">Entrena tu IA para empezar a agendar.</p>
            <Link
              href="/dashboard/setup"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors"
            >
              Comenzar →
            </Link>
          </div>
        )}

        <div className="border-t border-sidebar-line pt-4 mt-4">
          <div className="flex items-center gap-3 mb-3 rounded-lg bg-sidebar-card border border-sidebar-line p-3">
            <div className="h-7 w-7 rounded-full bg-sidebar-line border border-[#333] text-neutral-300 flex items-center justify-center font-bold text-xs shrink-0">
              {session.user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="truncate text-xs text-sidebar-text font-medium" title={session.user.email || ""}>
              {session.user.email}
            </div>
          </div>
          <form
            action={async () => {
              "use server"
              const { auth: serverAuth } = await import("@/lib/auth/server")
              const { headers: getHeaders } = await import("next/headers")
              await serverAuth.api.signOut({ headers: await getHeaders() });
              const { redirect: nav } = await import("next/navigation")
              nav("/login");
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-sidebar-hover transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 pb-16 lg:pt-0 lg:pb-0">
        {children}
      </main>

      <DashboardChatWidget />

      {/* Mobile Bottom Nav — hidden on lg+ */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-line flex items-center justify-around px-2 lg:hidden">
        <Link
          href="/dashboard"
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px] font-medium">Inicio</span>
        </Link>

        <Link
          href="/dashboard/calendar"
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-medium">Calendario</span>
        </Link>
        <Link
          href="/dashboard/setup"
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
        >
          <Wrench className="h-5 w-5" />
          <span className="text-[10px] font-medium">Setup</span>
        </Link>

        <Link
          href="/dashboard/settings"
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px] font-medium">Ajustes</span>
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
          >
            <Shield className="h-5 w-5" />
            <span className="text-[10px] font-medium">Admin</span>
          </Link>
        )}

        <form
          action={async () => {
            "use server"
            const { auth: serverAuth } = await import("@/lib/auth/server")
            const { headers: getHeaders } = await import("next/headers")
            await serverAuth.api.signOut({ headers: await getHeaders() });
            const { redirect: nav } = await import("next/navigation")
            nav("/login");
          }}
        >
          <button
            type="submit"
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-[10px] font-medium">Salir</span>
          </button>
        </form>
      </nav>

    </div>
  )
}
