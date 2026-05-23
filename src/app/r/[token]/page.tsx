import { redirect } from 'next/navigation'
import { resolveBarberByToken } from '@/lib/barber-auth/tenant'
import InstallScreen from './InstallScreen'

// -----------------------------------------------------------------------------
// /r/[token] — resolver del link personal del barbero (#71).
//
// Modelo:
//   · Si `?install=1` → pantalla de bienvenida + instrucciones para añadir
//     a pantalla de inicio (iOS Safari y Android Chrome). El jefe envía
//     este link por WhatsApp ("Bienvenido al equipo, abre esto y añádelo
//     a pantalla de inicio").
//   · Si no → redirige al Route Handler `/r/[token]/enter` que setea la
//     cookie y manda a la agenda. La cookie NO puede setearse aquí:
//     en Next 16, `cookies().set(...)` solo está permitido en Server
//     Functions / Route Handlers, no durante el render de una page.
//
// Sin token válido → mensaje genérico (no filtramos si el barbero existe).
// -----------------------------------------------------------------------------

interface Props {
  params: Promise<{ token: string }>
  searchParams: Promise<{ install?: string }>
}

export default async function BarberTokenResolver({
  params,
  searchParams,
}: Props) {
  const { token } = await params
  const { install } = await searchParams

  const resolved = await resolveBarberByToken(token)
  if (!resolved) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-8">
        <div className="max-w-sm text-center">
          <h1 className="mb-2 text-lg font-semibold text-ink">
            Enlace no válido
          </h1>
          <p className="text-sm text-ink-2">
            Este enlace personal ya no funciona. Pide al jefe que te genere
            uno nuevo.
          </p>
        </div>
      </main>
    )
  }

  // Pantalla bienvenida — la primera vez que el barbero abre el link.
  if (install === '1') {
    return (
      <InstallScreen
        barberName={resolved.barber.name}
        businessName={resolved.client.businessName}
        photoUrl={resolved.barber.photoUrl}
        token={token}
      />
    )
  }

  // Flow normal: delega al Route Handler que sí puede setear cookies.
  redirect(`/r/${token}/enter`)
}
