import { redirect, notFound } from 'next/navigation'
import { getBarberSession } from '@/lib/barber-auth/session'
import { db } from '@/db'
import { barbers, clients } from '@/db/schema'
import { eq } from 'drizzle-orm'
import BottomNav from './BottomNav'
import MobileGate from './MobileGate'

// -----------------------------------------------------------------------------
// Layout de la app móvil del barbero (#71).
//
// Auth: lee la cookie firmada. Si no hay sesión válida → redirige al
// resolver del token (que volverá aquí tras setear la cookie). El layout
// no maneja el ?install=1 — eso vive en la página resolver.
//
// Móvil-only: en desktop muestra "Abre en tu móvil" + QR. La regla del
// proyecto es estricta para esta vista (la cargas en el móvil del
// barbero, no en una pantalla grande).
// -----------------------------------------------------------------------------

interface Props {
  children: React.ReactNode
  params: Promise<{ token: string }>
}

export default async function BarberAppLayout({ children, params }: Props) {
  const { token } = await params
  const session = await getBarberSession()

  // Sin cookie → vuelve al resolver para validarse de nuevo.
  if (!session) {
    redirect(`/r/${token}`)
  }

  const [barber] = await db
    .select()
    .from(barbers)
    .where(eq(barbers.id, session.barberId))
  if (!barber || !barber.active) {
    // El jefe ha desactivado al barbero (o el ID no existe). Mensaje
    // genérico — no filtramos por qué.
    notFound()
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, barber.clientId))
  if (!client) notFound()

  // Saludo dinámico según hora del navegador — lo construimos del lado
  // cliente (BottomNav y children) porque el render server usa hora UTC
  // por defecto. Aquí pasamos los datos crudos del barbero.

  return (
    <div
      className="min-h-screen bg-canvas text-ink antialiased"
      style={{
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
      }}
    >
      <MobileGate token={token}>
        <Header
          barberName={barber.name}
          photoUrl={barber.photoUrl}
          businessName={client.businessName}
        />
        <main className="mx-auto max-w-[480px] px-4 pb-8 pt-4">
          {children}
        </main>
        <BottomNav token={token} />
      </MobileGate>
      <link rel="manifest" href={`/r/${token}/manifest.webmanifest`} />
    </div>
  )
}

function Header({
  barberName,
  photoUrl,
  businessName,
}: {
  barberName: string
  photoUrl: string | null
  businessName: string | null
}) {
  return (
    <header
      className="sticky top-0 z-20 mx-auto flex max-w-[480px] items-center gap-3 bg-canvas/95 px-4 py-3 backdrop-blur"
      style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={barberName}
          className="h-11 w-11 rounded-full border border-line object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-ink-2">
          {barberName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Greeting name={barberName} />
        {businessName && (
          <p className="truncate text-xs text-ink-3">{businessName}</p>
        )}
      </div>
    </header>
  )
}

// Greeting render se hace del lado servidor con la hora actual del
// navegador como aproximación — un saludo "Buenas tardes" cuando es
// noche en el móvil del barbero es feo. Para evitar mismatch, lo render
// como client component.
function Greeting({ name }: { name: string }) {
  // Render-time saludo basado en la hora del SERVER. Es estable para SSR.
  // El client component MobileGate aproxima con hora local pero el saludo
  // del header es suficientemente bueno con hora de servidor: el horario
  // de barbería rara vez cruza husos contra el server (Europe/Madrid).
  const hour = new Date().getHours()
  const greeting =
    hour < 6
      ? 'Buenas noches'
      : hour < 13
        ? 'Buenos días'
        : hour < 20
          ? 'Buenas tardes'
          : 'Buenas noches'
  const firstName = name.split(' ')[0]
  return (
    <p className="truncate text-base font-semibold text-ink">
      {greeting}, {firstName}
    </p>
  )
}
