export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { db } from '@/db'
import { appUsers, bookings, clients, ratings, tips } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getAppSession } from '@/lib/app-auth/session'
import RateForm from './RateForm'

// -----------------------------------------------------------------------------
// /b/[slug]/cuenta/rate/[bookingId] — pantalla de valoración táctil para
// clientes desde la PWA.
//
// Trigger: push notification con deep-link a esta URL disparado al
// marcar la cita como `completed` (manual desde el dashboard o por el
// sweep diario del cron de reminders). El cliente la abre, ve el
// contexto del servicio (barbero + fecha) y elige las estrellas.
//
// Auth: si no está logueado, redirigimos a /b/[slug]/cuenta para que haga
// login OTP y vuelva. Si está logueado pero no es su reserva, 404.
//
// Si ya valoró antes, mostramos la valoración existente (read-only) en vez
// de re-pedirla — el UNIQUE parcial sobre booking_id en DB lo garantiza
// también en la POST de submit.
// -----------------------------------------------------------------------------

interface Props {
  params: Promise<{ slug: string; bookingId: string }>
}

export default async function RatePage({ params }: Props) {
  const { slug, bookingId } = await params

  const [client] = await db.select().from(clients).where(eq(clients.publicSlug, slug))
  if (!client) notFound()

  const session = await getAppSession()
  if (!session) {
    // Redirige al login PWA con el destino guardado para volver tras OTP.
    redirect(`/b/${slug}/cuenta?next=${encodeURIComponent(`/b/${slug}/cuenta/rate/${bookingId}`)}`)
  }

  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, session.userId))
  if (!user) notFound()

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
  if (!booking || booking.clientId !== client.id) notFound()

  // Match por teléfono — bloquea valoraciones cruzadas.
  if (digitsOnly(booking.customerPhone) !== digitsOnly(user.phone)) notFound()

  // Si ya valoró, cargamos la valoración existente para mostrarla read-only.
  const [existing] = await db
    .select({ rating: ratings.rating, comment: ratings.comment, createdAt: ratings.createdAt })
    .from(ratings)
    .where(eq(ratings.bookingId, bookingId))

  // ¿Tip ya pagado para esta reserva? Si sí, no ofrecemos el CTA otra vez.
  const [existingTip] = await db
    .select({ amountCents: tips.amountCents, status: tips.status })
    .from(tips)
    .where(eq(tips.bookingId, bookingId))

  // Tip CTA disponible si la barbería está configurada para cobrar online.
  // Connect debe estar "active" (no solo creado), tipsEnabled true, y al
  // menos una sugerencia de importe válida (≥ MIN_TIP_CENTS = 100¢).
  const canTip =
    client.tipsEnabled &&
    client.stripeConnectStatus === 'active' &&
    Boolean(client.stripeConnectAccountId)
  const suggestedTipsCents = (client.tipsSuggestedCents ?? [])
    .filter((n) => Number.isInteger(n) && n >= 100)
    .slice(0, 3)

  return (
    <RateForm
      slug={slug}
      bookingId={bookingId}
      businessName={client.businessName}
      service={booking.service}
      barber={booking.barber}
      date={booking.date}
      time={booking.time}
      existing={existing ?? null}
      tipConfig={
        canTip && suggestedTipsCents.length > 0
          ? { suggestedCents: suggestedTipsCents }
          : null
      }
      existingTip={
        existingTip && existingTip.status === 'paid'
          ? { amountCents: existingTip.amountCents }
          : null
      }
    />
  )
}

function digitsOnly(p: string | null | undefined): string {
  return (p ?? '').replace(/\D/g, '')
}
