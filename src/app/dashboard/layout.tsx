export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogOut, Shield } from "lucide-react"
import DashboardChatWidget from "@/components/dashboard-chat-widget"
import MobileSidebar from "@/app/dashboard/_components/MobileSidebar"
import MobileMoreTrigger from "@/app/dashboard/_components/MobileMoreTrigger"
import { Wordmark } from "@/components/brand"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { PRIMARY_NAV, CONFIG_NAV, FOOTER_NAV, BOTTOM_NAV } from "@/app/dashboard/_components/nav-config"

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
  const isAdmin = email === 'vanwida@aistudios.pro' || email.endsWith('@aistudios.pro') || email.toLowerCase().includes('alex')

  const sections = [PRIMARY_NAV, CONFIG_NAV, FOOTER_NAV]

  return (
    <div className="flex h-screen bg-canvas text-ink overflow-hidden">

      {/* Mobile Top Bar — hidden on lg+ */}
      <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-surface border-b border-line flex items-center justify-between px-4 lg:hidden">
        <Link href="/" className="flex items-center text-ink">
          <Wordmark height={28} />
        </Link>
        <MobileSidebar email={email} isAdmin={isAdmin} needsSetup={needsSetup} />
      </div>

      {/* Sidebar — hidden on mobile, shown on lg+ */}
      <aside className="hidden lg:flex lg:flex-col w-60 border-r border-sidebar-line bg-sidebar p-5 shrink-0">
        <Link href="/" className="flex items-center mb-8 text-ink">
          <Wordmark height={30} />
        </Link>

        <nav className="flex-1 space-y-6">
          {sections.map((section) => (
            <div key={section.heading} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-ink-3">
                {section.heading}
              </p>
              {section.items.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-ink hover:bg-sidebar-hover transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          ))}

          {isAdmin && (
            <div className="pt-3 mt-2 border-t border-sidebar-line">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg border border-sidebar-line px-3 py-2.5 text-sm font-medium text-sidebar-text hover:text-ink hover:bg-sidebar-hover hover:border-line-strong transition-colors"
              >
                <Shield className="h-4 w-4" />
                <span className="font-semibold">Panel admin</span>
              </Link>
            </div>
          )}
        </nav>

        {needsSetup && (
          <div className="bg-sidebar-card border border-sidebar-line rounded-xl p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-brand mb-1">Configuración pendiente</p>
            <p className="text-xs text-ink-2 leading-relaxed">Termina de configurar tu bot para empezar a agendar.</p>
            <Link
              href="/dashboard/setup"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand hover:text-brand-strong transition-colors"
            >
              Continuar →
            </Link>
          </div>
        )}

        <div className="border-t border-sidebar-line pt-4 mt-4">
          <div className="flex items-center gap-3 mb-3 rounded-lg bg-sidebar-card border border-sidebar-line p-3">
            <div className="h-7 w-7 rounded-full bg-brand-softer border border-line text-brand flex items-center justify-center font-bold text-xs shrink-0">
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
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-sidebar-hover transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 pb-16 lg:pt-0 lg:pb-0">
        {children}
      </main>

      <DashboardChatWidget />

      {/* Mobile Bottom Nav — 4 primary shortcuts + "Más" opens the drawer */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-line flex items-center justify-around px-2 lg:hidden">
        {BOTTOM_NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-ink-3 hover:text-ink transition-colors"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        ))}
        <MobileMoreTrigger />
      </nav>

    </div>
  )
}
