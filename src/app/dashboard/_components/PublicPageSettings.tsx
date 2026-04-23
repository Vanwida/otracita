'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, ExternalLink, Loader2, Globe, Upload, Trash2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// PublicPageSettings — "Página pública" tab in Mi negocio.
// Wraps the branding + slug editor for /b/[slug] and persists via
// PATCH /api/public-page/config.
// -----------------------------------------------------------------------------

export interface PublicPageInitial {
  slug: string | null
  publicEnabled: boolean
  brandLogoUrl: string | null
  brandCoverUrl: string | null
  brandColor: string | null
  publicDescription: string | null
  instagramHandle: string | null
  tiktokHandle: string | null
  facebookUrl: string | null
  websiteUrl: string | null
}

interface Props {
  initial: PublicPageInitial
}

const SITE_ORIGIN = 'https://otracita.es'

export default function PublicPageSettings({ initial }: Props) {
  const [slug, setSlug] = useState(initial.slug || '')
  const [publicEnabled, setPublicEnabled] = useState(initial.publicEnabled)
  const [brandLogoUrl, setBrandLogoUrl] = useState(initial.brandLogoUrl || '')
  const [brandCoverUrl, setBrandCoverUrl] = useState(initial.brandCoverUrl || '')
  const [brandColor, setBrandColor] = useState(initial.brandColor || '#C9653C')
  const [publicDescription, setPublicDescription] = useState(initial.publicDescription || '')
  const [instagramHandle, setInstagramHandle] = useState(initial.instagramHandle || '')
  const [tiktokHandle, setTiktokHandle] = useState(initial.tiktokHandle || '')
  const [facebookUrl, setFacebookUrl] = useState(initial.facebookUrl || '')
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl || '')
  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const publicUrl = slug ? `${SITE_ORIGIN}/b/${slug}` : ''

  const onCopy = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const onSave = () => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const res = await fetch('/api/public-page/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: slug.trim() || undefined,
            publicEnabled,
            brandLogoUrl: brandLogoUrl.trim() || null,
            brandCoverUrl: brandCoverUrl.trim() || null,
            brandColor,
            publicDescription: publicDescription.trim() || null,
            instagramHandle: instagramHandle.trim() || null,
            tiktokHandle: tiktokHandle.trim() || null,
            facebookUrl: facebookUrl.trim() || null,
            websiteUrl: websiteUrl.trim() || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'No se pudo guardar.')
          return
        }
        // Server may have tweaked the slug to avoid collisions — adopt.
        if (data.slug) setSlug(data.slug)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } catch {
        setError('Error de red')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Globe className="h-4 w-4 text-brand" />
          Página pública
        </h2>
        <p className="text-sm text-ink-2 mt-1">
          Tu URL para pegar en Instagram, Google Maps, flyers. El cliente la abre y reserva cita en 4 toques.
          Usa el motor de tu barbería (mismo horario, mismos barberos, misma agenda).
        </p>
      </div>

      {/* URL + copy + preview */}
      <div className="rounded-xl bg-overlay border border-line p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-ink-3 mb-1">Tu enlace</p>
            <p className="font-mono text-sm text-ink truncate">{publicUrl || '(sin slug)'}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onCopy}
              disabled={!publicUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors disabled:opacity-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a
              href={publicUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!publicUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink transition-colors"
              style={{ pointerEvents: publicUrl ? undefined : 'none', opacity: publicUrl ? 1 : 0.5 }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Previsualizar
            </a>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={publicEnabled}
            onChange={(e) => setPublicEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Página pública activa
        </label>
        {!publicEnabled && (
          <p className="text-xs text-warning">
            Desactivada: cualquiera que abra tu enlace verá 404. Útil si estás de vacaciones o cerrado.
          </p>
        )}
      </div>

      {/* Slug */}
      <Field
        label="Slug"
        hint="Letras, números y guiones. Ej: barberia-central. Mín. 3 caracteres."
        value={slug}
        onChange={setSlug}
        placeholder="mi-barberia"
      />

      {/* Branding: upload de logo + portada. Guardamos en Vercel Blob y el
          URL devuelta se pega en el input. El barbero también puede pegar
          una URL directa (p.ej. la de su web) si prefiere no subir. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ImageUpload
          label="Logo"
          kind="logo"
          url={brandLogoUrl}
          onChange={setBrandLogoUrl}
          hint="Cuadrado ideal. PNG, JPG o WEBP, máx. 3 MB."
          aspect="square"
        />
        <ImageUpload
          label="Portada"
          kind="cover"
          url={brandCoverUrl}
          onChange={setBrandCoverUrl}
          hint="Imagen ancha para la cabecera (ej. interior del local)."
          aspect="wide"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-ink-2">Color principal</label>
        <input
          type="color"
          value={brandColor}
          onChange={(e) => setBrandColor(e.target.value)}
          className="h-10 w-14 rounded border border-line cursor-pointer"
        />
        <span className="font-mono text-xs text-ink-3">{brandColor}</span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-ink-2">Descripción corta</label>
        <textarea
          value={publicDescription}
          onChange={(e) => setPublicDescription(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Ej. Más de 20 años cortando en el barrio. Especializados en corte clásico + barba."
          className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none resize-none"
        />
        <p className="text-xs text-ink-3">{publicDescription.length}/600</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Instagram (sin @)" value={instagramHandle} onChange={setInstagramHandle} placeholder="mi_barberia" />
        <Field label="TikTok (sin @)" value={tiktokHandle} onChange={setTiktokHandle} placeholder="mi_barberia" />
        <Field label="Facebook (URL)" value={facebookUrl} onChange={setFacebookUrl} placeholder="https://facebook.com/..." />
        <Field label="Web externa" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://mi-barberia.com" />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            Guardado
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-brand hover:bg-brand-strong px-6 py-3 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink-2">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
      />
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// ImageUpload — file picker + preview + remove for logo/cover fields.
// Uploads to /api/public-page/upload?kind=... (backed by Vercel Blob) and
// surfaces the resulting URL through `onChange`. The caller still has to
// press "Guardar cambios" to persist the URL into the DB — decoupling upload
// from save means if the user uploads and navigates away, the file exists
// in Blob but the DB is unchanged (orphaned blob). Acceptable at MVP volume.
// -----------------------------------------------------------------------------
function ImageUpload({
  label,
  kind,
  url,
  onChange,
  hint,
  aspect,
}: {
  label: string
  kind: 'logo' | 'cover'
  url: string
  onChange: (next: string) => void
  hint?: string
  aspect: 'square' | 'wide'
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/public-page/upload?kind=${kind}`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'No se pudo subir.')
        return
      }
      onChange(data.url)
    } catch {
      setError('Error de red')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink-2">{label}</label>
      <div
        className={`relative bg-overlay border border-line rounded-lg overflow-hidden ${
          aspect === 'square' ? 'aspect-square max-w-[180px]' : 'aspect-[16/6]'
        } flex items-center justify-center`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-ink-3">Sin imagen</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink cursor-pointer transition-colors">
          <Upload className="h-3.5 w-3.5" />
          {url ? 'Reemplazar' : 'Subir imagen'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = ''
            }}
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-3 hover:text-danger transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Quitar
          </button>
        )}
      </div>

      <input
        type="text"
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder="o pega una URL pública"
        className="bg-surface border border-line rounded-lg p-2 text-xs text-ink focus:border-brand outline-none transition-colors"
      />

      {error && <p className="text-xs text-danger">{error}</p>}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  )
}
