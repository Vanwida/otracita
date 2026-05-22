'use client'

import { useState } from 'react'
import {
  Globe,
  Pencil,
  ExternalLink,
  Copy,
  Check,
  AtSign,
  Music2,
  Link as LinkIcon,
  Sun,
  Moon,
} from 'lucide-react'
import SlideOver from '@/app/dashboard/_components/SlideOver'
import PublicPageSettings, {
  type PublicPageInitial,
} from '@/app/dashboard/_components/PublicPageSettings'
import { SITE_ORIGIN } from '@/lib/site'
import { FEEDBACK_MS } from '@/lib/ui-timings'
import { BRAND_TERRACOTA_HEX } from '@/lib/brand-hex'

// -----------------------------------------------------------------------------
// ReservasOnlineCard — wrapper de la pestaña Reservas online.
//
// Patrón canónico del proyecto (regla dura #1 y #2): la pestaña muestra un
// resumen compacto en cabecera (URL pública, estado, logo, color, redes) que
// cabe en viewport sin scroll; la edición del editor grande
// (PublicPageSettings, 511 líneas con uploads / branding / redes) vive en un
// SlideOver lateral más ancho. Cero forms inline largos en la pestaña.
//
// PublicPageSettings sigue auto-guardando contra /api/public-page/config —
// no se toca su lógica, sólo cambia el chasis.
// -----------------------------------------------------------------------------

interface Props {
  initial: PublicPageInitial
}

export default function ReservasOnlineCard({ initial }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const publicUrl = initial.slug ? `${SITE_ORIGIN}/${initial.slug}` : ''
  const brandColor = initial.brandColor || BRAND_TERRACOTA_HEX
  const theme = initial.brandTheme === 'dark' ? 'dark' : 'light'

  const onCopy = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), FEEDBACK_MS.copied)
    } catch {
      /* ignore */
    }
  }

  const socials = [
    { value: initial.instagramHandle, icon: AtSign, label: 'Instagram' },
    { value: initial.tiktokHandle, icon: Music2, label: 'TikTok' },
    { value: initial.facebookUrl, icon: LinkIcon, label: 'Facebook' },
    { value: initial.websiteUrl, icon: LinkIcon, label: 'Web' },
  ].filter((s) => !!s.value)

  return (
    <>
      <section className="rounded-2xl border border-line bg-surface p-4 md:p-5">
        <header className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-softer text-brand-strong"
            >
              <Globe className="h-4 w-4" />
            </span>
            <h2
              className="font-semibold text-ink"
              style={{ fontSize: 'var(--text-section-title)' }}
            >
              Página pública de reservas
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Editar página pública"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-overlay"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </button>
        </header>

        {/* URL + estado */}
        <div className="rounded-xl border border-line bg-canvas p-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wider text-ink-3 mb-1">
                Tu enlace
              </p>
              <p className="font-mono text-sm text-ink truncate">
                {publicUrl || '(sin slug)'}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onCopy}
                disabled={!publicUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors disabled:opacity-50"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <a
                href={publicUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!publicUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-overlay px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
                style={{
                  pointerEvents: publicUrl ? undefined : 'none',
                  opacity: publicUrl ? 1 : 0.5,
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Previsualizar
              </a>
            </div>
          </div>
        </div>

        {/* Resumen branding + redes */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-[11px] uppercase tracking-wider text-ink-3 mb-2">
              Branding
            </p>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-8 w-8 rounded-lg border border-line shrink-0"
                style={{ backgroundColor: brandColor }}
                title={`Color: ${brandColor}`}
              />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-medium text-ink">
                  {initial.publicEnabled ? 'App publicada' : 'No publicada'}
                </p>
                <p className="text-ink-3 inline-flex items-center gap-1">
                  {theme === 'dark' ? (
                    <>
                      <Moon className="h-3 w-3" /> Tema oscuro
                    </>
                  ) : (
                    <>
                      <Sun className="h-3 w-3" /> Tema claro
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-canvas p-3">
            <p className="text-[11px] uppercase tracking-wider text-ink-3 mb-2">
              Redes sociales
            </p>
            {socials.length === 0 ? (
              <p className="text-xs text-ink-3">Sin redes conectadas todavía.</p>
            ) : (
              <ul className="flex flex-wrap items-center gap-2">
                {socials.map(({ value, icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-1 text-[11px] text-ink-2"
                    title={String(value)}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* SlideOver con el editor completo (ancho ampliado por la cantidad de
          campos del PublicPageSettings: logo/portada/colores/redes/etc).
          PublicPageSettings ya implementa el layout canónico (scroll body +
          sticky save footer) — no añadir wrapper o se rompe el sticky. */}
      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title="Página pública de reservas"
        ariaLabel="Editar página pública de reservas"
        width="w-[560px] max-w-[92vw]"
      >
        <PublicPageSettings initial={initial} />
      </SlideOver>
    </>
  )
}
