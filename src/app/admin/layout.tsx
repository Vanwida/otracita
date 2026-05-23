export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Monogram } from '@/components/brand';
import { isAdminUser } from '@/lib/auth/admin';
import { AdminSidebarNav } from './_components/AdminSidebarNav';
import { getAdminNavBadges } from '@/lib/admin/nav-badges';
import { renderAdminLockGuard } from '@/lib/admin-lock/page-guard';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect('/login');
  }

  // Admin check — single source of truth in `@/lib/auth/admin`. Do NOT inline
  // the rule here again; drift between copies is what produced the original
  // `email.includes('aistudios')` bypass path.
  if (!isAdminUser(session)) {
    redirect('/dashboard');
  }

  // Admin-lock — el iPad puede estar logueado como el jefe (que ADEMÁS es
  // admin de la plataforma). Si el jefe ha marcado el área "admin" como
  // sensible, el panel admin pide el PIN. Acabar aquí antes de cargar las
  // badges evita queries innecesarias.
  const lockOverlay = await renderAdminLockGuard('admin');
  if (lockOverlay) return lockOverlay;

  // Counts that drive the red badges in the sidebar. Single query batch so
  // the layout cost is bounded as we add more badge sources.
  const badges = await getAdminNavBadges();

  return (
    <div className="relative flex h-screen bg-canvas text-ink overflow-hidden">
      {/* Subtle ambient warm tint — single small glow, top-right */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] rounded-full bg-brand-softer blur-[120px] opacity-40 pointer-events-none z-0" />

      {/* Sidebar */}
      <aside className="relative z-10 w-64 border-r border-sidebar-line bg-sidebar p-6 flex flex-col">
        <Link href="/" className="group flex items-center gap-3 mb-10" title="Volver a otracita.es">
          <div className="flex items-center gap-2.5 text-ink group-hover:text-brand transition-colors">
            <Monogram height={32} inkColor="currentColor" dotColor="#C9653C" />
            <div className="flex flex-col leading-tight">
              <span className="font-display text-lg font-semibold tracking-tight">otracita</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand">admin</span>
            </div>
          </div>
        </Link>

        <AdminSidebarNav badges={badges} />

        <div className="border-t border-sidebar-line pt-6 mt-6">
          <div className="flex items-center gap-3 mb-4 rounded-xl bg-surface border border-line p-3">
            <div className="h-8 w-8 rounded-full bg-brand-softer border border-line text-brand flex items-center justify-center font-bold">
              {session.user.email?.charAt(0).toUpperCase()}
            </div>
            <div
              className="truncate text-xs text-ink-2 overflow-hidden font-medium"
              title={session.user.email || ''}
            >
              {session.user.email}
            </div>
          </div>
          <form
            action={async () => {
              'use server';
              const { headers: getHeaders } = await import('next/headers');
              await auth.api.signOut({ headers: await getHeaders() });
              redirect('/login');
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl bg-transparent border border-danger/20 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10 hover:border-danger/40"
            >
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative z-10 flex-1 overflow-y-auto w-full h-full">{children}</main>
    </div>
  );
}
