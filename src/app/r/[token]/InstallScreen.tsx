'use client'

import { useState } from 'react'

// Pantalla bienvenida + instrucciones para "Añadir a pantalla de inicio".
// Es la primera cosa que ve el barbero al abrir el link que el jefe le
// mandó por WhatsApp. Objetivo: que en 3 taps tenga el icono en home.

interface Props {
  barberName: string
  businessName: string | null
  photoUrl: string | null
  token: string
}

export default function InstallScreen({
  barberName,
  businessName,
  photoUrl,
  token,
}: Props) {
  const [platform, setPlatform] = useState<'ios' | 'android'>(() => {
    if (typeof navigator === 'undefined') return 'ios'
    return /android/i.test(navigator.userAgent) ? 'android' : 'ios'
  })

  const continueUrl = `/r/${token}/agenda`

  return (
    <main
      className="min-h-screen p-6"
      style={{
        background:
          'radial-gradient(120% 80% at 50% 0%, var(--color-brand-softer) 0%, var(--color-canvas) 70%)',
      }}
    >
      <div className="mx-auto max-w-md pt-10">
        <div className="flex flex-col items-center text-center">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={barberName}
              className="h-24 w-24 rounded-full border-2 border-line object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-line bg-surface text-3xl font-bold text-ink-2">
              {barberName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <h1 className="mt-5 text-2xl font-bold text-ink">
            Hola, {barberName.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {businessName ? `Tu app en ${businessName}` : 'Tu app personal'}
          </p>
          <p className="mt-4 text-sm text-ink-2">
            Esta es <strong>tu</strong> app. Verás tus citas, tus ventas y tus
            propinas. Añádela a la pantalla de inicio para abrirla de un
            toque.
          </p>
        </div>

        <div className="mt-8 rounded-control border border-line bg-surface p-5 shadow-sm">
          <div className="mb-4 flex gap-1 rounded-full bg-overlay/60 p-1">
            <button
              type="button"
              onClick={() => setPlatform('ios')}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                platform === 'ios'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-2'
              }`}
            >
              iPhone
            </button>
            <button
              type="button"
              onClick={() => setPlatform('android')}
              className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${
                platform === 'android'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-2'
              }`}
            >
              Android
            </button>
          </div>

          {platform === 'ios' ? (
            <ol className="space-y-3 text-sm text-ink-2">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-softer text-xs font-bold text-brand">
                  1
                </span>
                <span>
                  Pulsa el botón <strong>Compartir</strong> (cuadrado con
                  flecha hacia arriba) abajo en Safari.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-softer text-xs font-bold text-brand">
                  2
                </span>
                <span>
                  Desplázate y toca{' '}
                  <strong>Añadir a pantalla de inicio</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-softer text-xs font-bold text-brand">
                  3
                </span>
                <span>Toca <strong>Añadir</strong>. Listo.</span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm text-ink-2">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-softer text-xs font-bold text-brand">
                  1
                </span>
                <span>
                  Pulsa el menú <strong>⋮</strong> arriba a la derecha en
                  Chrome.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-softer text-xs font-bold text-brand">
                  2
                </span>
                <span>
                  Toca <strong>Añadir a pantalla principal</strong> (o
                  <strong> Instalar app</strong>).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-softer text-xs font-bold text-brand">
                  3
                </span>
                <span>Confirma. Listo.</span>
              </li>
            </ol>
          )}
        </div>

        <a
          href={continueUrl}
          className="mt-6 flex w-full items-center justify-center rounded-control bg-[var(--color-espresso)] py-3 text-base font-semibold text-[var(--color-cream-high)] shadow-sm transition-colors hover:bg-[var(--color-espresso-2)]"
        >
          Entrar a mi agenda
        </a>
        <p className="mt-3 text-center text-xs text-ink-3">
          Puedes volver a este enlace tantas veces como necesites.
        </p>
      </div>
    </main>
  )
}
