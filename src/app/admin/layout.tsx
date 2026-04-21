export const dynamic = 'force-dynamic'

import { auth } from "@/lib/auth/server"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Users, LayoutDashboard, LogOut, FileText, Shield, Activity, CheckSquare } from "lucide-react"
import { isAdminUser } from "@/lib/auth/admin"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session?.user) {
    redirect("/login")
  }

  // Admin check — single source of truth in `@/lib/auth/admin`. Do NOT inline
  // the rule here again; drift between copies is what produced the original
  // `email.includes('aistudios')` bypass path.
  if (!isAdminUser(session)) {
    redirect("/dashboard")
  }

  return (
    <div className="relative flex h-screen bg-[#020205] text-[#FAFAFA] overflow-hidden">
      {/* Background ambient AI glow */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[60%] h-[40%] rounded-full bg-indigo-600/10 blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[150px]" />
      </div>

      {/* Sidebar */}
      <aside className="relative z-10 w-64 border-r border-indigo-500/10 bg-[#040408]/60 backdrop-blur-3xl p-6 flex flex-col shadow-[4px_0_30px_rgba(79,70,229,0.05)]">
        <Link href="/" className="group flex items-center gap-3 mb-10">
          <div className="relative flex h-9 w-9 items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-indigo-500/30 to-cyan-500/30 blur-md group-hover:from-indigo-400/50 group-hover:to-cyan-400/50 transition-all duration-500 rotate-45 group-hover:rotate-90" />
            <div className="absolute inset-0.5 rounded-xl bg-[#030308] z-10" />
            <Shield className="relative z-20 h-4 w-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
          </div>
          <span className="font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-cyan-300 to-indigo-100 uppercase text-lg group-hover:drop-shadow-[0_0_8px_rgba(165,180,252,0.5)] transition-all">Admin</span>
        </Link>
        
        <nav className="flex-1 space-y-3">
          <Link href="/admin" className="group relative flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5 text-sm font-medium text-indigo-200 transition-all hover:bg-indigo-500/10 hover:border-indigo-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] overflow-hidden">
            <div className="absolute left-0 top-0 w-1 h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]" />
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <LayoutDashboard className="h-4 w-4 text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]" />
            Control Panel
          </Link>
          <Link href="/admin/onboarding" className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-indigo-200/80 transition-all hover:bg-indigo-500/10 hover:text-indigo-100 hover:border-indigo-500/30 hover:shadow-[0_0_15px_rgba(99,102,241,0.12)]">
            <CheckSquare className="h-4 w-4 text-indigo-300" />
            Onboarding
          </Link>
          <Link href="/admin/clients" className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-gray-500 transition-all hover:bg-white/[0.04] hover:text-gray-300 hover:border-white/5 opacity-50 cursor-not-allowed">
            <Users className="h-4 w-4" />
            Clientes (SaaS)
          </Link>
          <Link href="/admin/leads" className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-gray-500 transition-all hover:bg-white/[0.04] hover:text-gray-300 hover:border-white/5 opacity-50 cursor-not-allowed">
            <FileText className="h-4 w-4" />
            Leads Web
          </Link>
          <Link href="/admin/email-health" className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-gray-400 transition-all hover:bg-white/[0.04] hover:text-gray-200 hover:border-white/5">
            <Activity className="h-4 w-4" />
            Salud parser
          </Link>
        </nav>
        
        <div className="border-t border-indigo-500/10 pt-6 mt-6">
          <div className="flex items-center gap-3 mb-4 rounded-xl bg-indigo-950/20 border border-indigo-500/10 p-3 relative overflow-hidden">
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-16 bg-cyan-500/10 blur-xl rounded-full" />
            <div className="relative z-10 h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-cyan-500/20 border border-indigo-500/30 text-cyan-300 flex items-center justify-center font-bold shadow-[0_0_10px_rgba(34,211,238,0.2)]">
              {session.user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="relative z-10 truncate text-xs text-indigo-200/70 overflow-hidden font-medium" title={session.user.email || ""}>
              {session.user.email}
            </div>
          </div>
          <form
            action={async () => {
              "use server"
              const { headers: getHeaders } = await import("next/headers")
              await auth.api.signOut({ headers: await getHeaders() })
              redirect("/login")
            }}
          >
            <button
              type="submit"
              className="group flex w-full items-center gap-3 rounded-xl bg-transparent border border-red-500/10 px-3 py-2 text-sm font-medium text-red-500/80 transition-all hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 hover:shadow-[0_0_15px_rgba(239,68,68,0.15)]"
            >
              <LogOut className="h-4 w-4 group-hover:drop-shadow-[0_0_5px_rgba(239,68,68,0.8)] transition-all" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-y-auto w-full h-full scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-transparent">
        {children}
      </main>
    </div>
  )
}
