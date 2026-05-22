import { notFound } from 'next/navigation'
import { db } from '@/db'
import { clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import TopBar from '../TopBar'
import BottomTabBar from '../BottomTabBar'
import { buildPalette } from '../brand-utils'
import CustomerAccount from './CustomerAccount'

// -----------------------------------------------------------------------------
// /[slug]/cuenta — pantalla "Perfil" del cliente (accessible desde el
// BottomTabBar). Hereda el theming de la barbería para que el cliente
// sienta que sigue dentro de la misma app.
//
// Estados:
//   · No loggeado → flujo OTP (teléfono → código por WhatsApp → verificar)
//   · Loggeado    → tarjeta usuario + Mis reservas (próximas + historial) +
//                   Logout
// -----------------------------------------------------------------------------

interface Props {
  params: Promise<{ slug: string }>
}

async function loadBarbershop(slug: string) {
  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client || !client.publicEnabled) return null
  return client
}

export default async function CuentaPage({ params }: Props) {
  const { slug } = await params
  const client = await loadBarbershop(slug)
  if (!client) notFound()

  const palette = buildPalette(client.brandTheme, client.brandColor)
  const headerLogoUrl =
    palette.isDark && client.brandLogoAltUrl
      ? client.brandLogoAltUrl
      : client.brandLogoUrl

  return (
    <main
      className="min-h-screen antialiased"
      style={{
        ['--accent' as string]: palette.accent,
        ['--accent-soft' as string]: palette.accentSoft,
        ['--accent-strong' as string]: palette.accentStrong,
        ['--accent-ink' as string]: palette.accentInk,
        ['--brand' as string]: palette.accent,
        ['--brand-2' as string]: palette.accent,
        ['--brand-soft' as string]: palette.accentSoft,
        ['--brand-2-soft' as string]: palette.accentSoft,
        ['--brand-strong' as string]: palette.accentStrong,
        ['--brand-ink' as string]: palette.accentInk,
        ['--theme-canvas' as string]: palette.tokens.canvas,
        ['--theme-surface' as string]: palette.tokens.surface,
        ['--theme-surface-elevated' as string]: palette.tokens.surfaceElevated,
        ['--theme-overlay' as string]: palette.tokens.overlay,
        ['--theme-line' as string]: palette.tokens.line,
        ['--theme-ink' as string]: palette.tokens.ink,
        ['--theme-ink-2' as string]: palette.tokens.ink2,
        ['--theme-ink-3' as string]: palette.tokens.ink3,
        ['--color-canvas' as string]: palette.tokens.canvas,
        ['--color-surface' as string]: palette.tokens.surface,
        ['--color-line' as string]: palette.tokens.line,
        ['--color-ink' as string]: palette.tokens.ink,
        ['--color-ink-2' as string]: palette.tokens.ink2,
        ['--color-ink-3' as string]: palette.tokens.ink3,
        backgroundColor: 'var(--theme-canvas)',
        color: 'var(--theme-ink)',
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
      }}
    >
      <TopBar businessName={client.businessName} logoUrl={headerLogoUrl} slug={slug} />

      <CustomerAccount slug={slug} businessName={client.businessName} />

      <BottomTabBar slug={slug} activeTab="perfil" />
    </main>
  )
}
