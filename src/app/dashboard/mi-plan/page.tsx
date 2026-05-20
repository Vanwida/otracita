export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { db } from '@/db'
import { clients, subscriptions } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { CreditCard, Calendar, Receipt, AlertCircle, FileText, ArrowRight, Clock } from 'lucide-react'
import OpenStripePortalButton from '@/app/dashboard/_components/OpenStripePortalButton'
import OnlinePaymentsSummary from '@/app/dashboard/_components/OnlinePaymentsSummary'
import AreaShell from '@/app/dashboard/_components/AreaShell'
import AreaContent from '@/app/dashboard/_components/AreaContent'
import UpgradeToProButton from './UpgradeToProButton'
import { stripe } from '@/lib/stripe'
import { PLANS } from '@/lib/stripe'
import { getTier, isInTrial, trialDaysLeft, type Tier } from '@/lib/billing/tier'

interface InvoiceSummary {
  id: string
  amount: number
  currency: string
  status: string
  createdAt: Date
  invoiceUrl: string | null
  pdfUrl: string | null
}

// -----------------------------------------------------------------------------
// "Mi plan" — what the TENANT pays US (otracita subscription). Previously
// lived at /dashboard/facturacion, renamed to free that sidebar slot for the
// new feature that lets the barber emit invoices to THEIR customers.
//
// Kept the Stripe-portal UX identical; added a CTA card at the top to guide
// users to the new invoicing feature without making them hunt for it.
// -----------------------------------------------------------------------------
export default async function MiPlanPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.email) redirect('/login')

  const [client] = await db.select().from(clients).where(eq(clients.email, session.user.email))
  if (!client) redirect('/dashboard/setup')

  // Most recent subscription row for this tenant (one-per-client in practice).
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clientId, client.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1)

  // Plan label — fall back to the client's `plan` column if PLANS doesn't know.
  const planId = (subscription?.plan ?? client.plan ?? 'chatbot') as keyof typeof PLANS
  const planMeta = PLANS[planId] ?? null

  // Best-effort invoice fetch — don't block rendering if Stripe is down.
  let invoices: InvoiceSummary[] = []
  let invoicesError: string | null = null
  if (client.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({
        customer: client.stripeCustomerId,
        limit: 5,
      })
      invoices = list.data.map((inv) => ({
        id: inv.id ?? 'unknown',
        amount: inv.amount_paid ?? inv.amount_due ?? 0,
        currency: inv.currency ?? 'eur',
        status: inv.status ?? 'open',
        createdAt: new Date((inv.created ?? 0) * 1000),
        invoiceUrl: inv.hosted_invoice_url ?? null,
        pdfUrl: inv.invoice_pdf ?? null,
      }))
    } catch (e) {
      invoicesError = e instanceof Error ? e.message : 'No se pudieron cargar las facturas'
    }
  }

  const hasStripeCustomer = Boolean(client.stripeCustomerId)
  const tier = getTier(client)
  const inTrial = isInTrial(client)
  const daysLeft = trialDaysLeft(client)

  return (
    <AreaShell area="ajustes">
      <AreaContent scroll="region" maxWidth="5xl">
      <p className="text-ink-2 mb-4" style={{ fontSize: 'var(--text-meta)' }}>
        Tu suscripción a otracita: plan, próximos cobros y facturas pasadas.
      </p>

      {/* Tier + trial banner — single source of truth para el barbero sobre
          dónde está y qué pasa el día X. */}
      <TierBanner tier={tier} inTrial={inTrial} daysLeft={daysLeft} hasStripeCustomer={hasStripeCustomer} />

      {/* CTA: point users to the NEW feature (facturas a sus clientes) */}
      <Link
        href="/dashboard/facturas"
        className="group block bg-brand-softer border border-brand/20 rounded-2xl p-5 md:p-6 mb-6 hover:border-brand hover:shadow-warm-soft transition-all"
      >
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-xl bg-brand border border-brand flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-brand-ink" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-strong mb-1">Nuevo</p>
            <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>Gestiona las facturas de tus clientes</h2>
            <p className="text-sm text-ink-2 mt-1">
              Activa la facturación automática y emite tickets/facturas con cada reserva. Exporta CSV mensual para tu gestor.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-brand mt-3 shrink-0 group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      {/* Plan card */}
      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 mb-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-xl bg-brand-softer border border-brand/20 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-brand" />
          </div>

          <div className="flex-1 min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-1">Plan actual</p>
            <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-page-title)' }}>{planMeta?.name ?? planId}</h2>
            {planMeta && (
              <p className="text-sm text-ink-2 mt-1">{planMeta.description}</p>
            )}

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              {subscription ? (
                <>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-overlay px-3 py-1.5 text-sm text-ink">
                    {(subscription.amount / 100).toFixed(2)} {subscription.currency?.toUpperCase() ?? 'EUR'}/mes
                  </span>
                  <SubscriptionStatusBadge status={subscription.status} />
                  {subscription.currentPeriodEnd && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                      <Calendar className="h-3.5 w-3.5 text-ink-3" />
                      Próximo cobro: {subscription.currentPeriodEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-overlay px-3 py-1.5 text-sm text-ink-2">
                  Sin suscripción activa
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-line">
          <OpenStripePortalButton
            disabled={!hasStripeCustomer}
            disabledReason={!hasStripeCustomer ? 'Aún no tienes una cuenta de Stripe asociada. Contacta con soporte.' : undefined}
          />
          {hasStripeCustomer && (
            <p className="text-xs text-ink-3 mt-2">
              Actualiza tu tarjeta, descarga facturas o cancela tu suscripción en el portal seguro de Stripe.
            </p>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 md:px-6 border-b border-line flex items-center gap-2">
          <Receipt className="h-4 w-4 text-ink-3" />
          <h2 className="text-base font-semibold text-ink">Últimas facturas de tu plan</h2>
        </div>

        {invoicesError ? (
          <div className="p-6 flex items-center gap-3 text-sm text-warning">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{invoicesError}</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-3">
            {hasStripeCustomer ? 'Todavía no hay facturas.' : 'Te aparecerán aquí cuando completes tu primer pago.'}
          </div>
        ) : (
          <div className="divide-y divide-line">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-4 md:px-6">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {(inv.amount / 100).toFixed(2)} {inv.currency.toUpperCase()}
                  </p>
                  <p className="text-xs text-ink-3">
                    {inv.createdAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <InvoiceStatusBadge status={inv.status} />
                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand hover:text-brand-strong underline underline-offset-2"
                  >
                    Descargar PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Online payments (Stripe Connect) summary — what the barber receives
          from THEIR customers. Distinct from the subscription they pay us. */}
      <OnlinePaymentsSummary connectStatus={client.stripeConnectStatus} />
      </AreaContent>
    </AreaShell>
  )
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  if (status === 'active' || status === 'trialing') {
    return <span className="inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">Activa</span>
  }
  if (status === 'past_due' || status === 'unpaid') {
    return <span className="inline-flex items-center rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">Pago pendiente</span>
  }
  if (status === 'cancelled' || status === 'canceled') {
    return <span className="inline-flex items-center rounded-full bg-danger/10 text-danger border border-danger/20 px-2.5 py-0.5 text-xs font-medium">Cancelada</span>
  }
  return <span className="inline-flex items-center rounded-full bg-overlay text-ink-2 border border-line px-2.5 py-0.5 text-xs font-medium">{status}</span>
}

/* ─── Tier + trial banner ──────────────────────────────────
   - Si está en trial → banner gold con días restantes y CTA "Añadir tarjeta"
   - Si tier=solo y no trial → CTA upgrade a Pro
   - Si tier=pro/estudio activo → confirmación calma con copy correcto */
function TierBanner({
  tier,
  inTrial,
  daysLeft,
  hasStripeCustomer,
}: {
  tier: Tier
  inTrial: boolean
  daysLeft: number
  hasStripeCustomer: boolean
}) {
  const tierLabel = tier === 'solo' ? 'Solo' : tier === 'pro' ? 'Pro' : 'Estudio'

  if (inTrial) {
    return (
      <div className="mb-6 rounded-2xl border border-gold bg-gold-soft/30 p-5 md:p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-gold" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold mb-1">
              Prueba Pro · te quedan {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
            </p>
            <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
              Estás probando todo lo de Pro gratis.
            </h2>
            <p className="text-sm text-ink-2 mt-1">
              Cuando termine, eliges si pagas mensual (49 €) o anual (39 €/mes). Si no añades tarjeta, vuelves a Solo gratis sin perder datos.
            </p>
            {hasStripeCustomer && (
              <div className="mt-4">
                <OpenStripePortalButton />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (tier === 'solo') {
    return (
      <div className="mb-6 rounded-2xl border border-brand/30 bg-brand-softer p-5 md:p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-12 w-12 rounded-xl bg-brand border border-brand flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5 text-brand-ink" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-strong mb-1">
              Estás en Solo (gratis)
            </p>
            <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
              Pasa a Pro y prueba 14 días gratis.
            </h2>
            <p className="text-sm text-ink-2 mt-1">
              Bot WhatsApp, multi-barbero, SumUp Tap to Pay, fidelidad y promos. Sin permanencia.
            </p>
            <UpgradeToProButton tier="pro" label="Empezar prueba de 14 días" />
          </div>
        </div>
      </div>
    )
  }

  // tier=pro o estudio sin trial → estado calmado
  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface p-5 md:p-6">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="h-12 w-12 rounded-xl bg-brand-softer border border-brand/20 flex items-center justify-center shrink-0">
          <CreditCard className="h-5 w-5 text-brand" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-1">
            Tu plan
          </p>
          <h2 className="font-semibold text-ink" style={{ fontSize: 'var(--text-section-title)' }}>
            otracita {tierLabel}
          </h2>
          <p className="text-sm text-ink-2 mt-1">
            Acceso completo a todas las herramientas de tu plan. Sin permanencia en {tierLabel}.
          </p>
        </div>
      </div>
    </div>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return <span className="inline-flex items-center rounded-full bg-success/10 text-success border border-success/20 px-2.5 py-0.5 text-xs font-medium">Pagada</span>
  }
  if (status === 'open') {
    return <span className="inline-flex items-center rounded-full bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 text-xs font-medium">Pendiente</span>
  }
  if (status === 'void' || status === 'uncollectible') {
    return <span className="inline-flex items-center rounded-full bg-danger/10 text-danger border border-danger/20 px-2.5 py-0.5 text-xs font-medium">Anulada</span>
  }
  return <span className="inline-flex items-center rounded-full bg-overlay text-ink-2 border border-line px-2.5 py-0.5 text-xs font-medium">{status}</span>
}
