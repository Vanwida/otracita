'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { Check, Copy, ExternalLink, Loader2, Globe, Upload, Trash2, Sun, Moon } from 'lucide-react'
import { BRAND_TERRACOTA_HEX, PUBLIC_PWA_THEME } from '@/lib/brand-hex'
import FormGrid from './FormGrid'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// PublicPageSettings — editor de la app/página pública del barbero.
// Es la fuente UNICA para configurar la app (branding, slug, link público,
// colores, logo, etc). Se renderiza dentro de /dashboard/app. Persiste via
// PATCH /api/public-page/config.
// -----------------------------------------------------------------------------

export interface PublicPageInitial {
  slug: string | null
  publicEnabled: boolean
  brandLogoUrl: string | null
  brandLogoAltUrl: string | null
  brandCoverUrl: string | null
  brandColor: string | null
  brandTheme: string
  publicDescription: string | null
  instagramHandle: string | null
  tiktokHandle: string | null
  facebookUrl: string | null
  websiteUrl: string | null
}

interface Props {
  initial: PublicPageInitial
}

import { SITE_ORIGIN } from '@/lib/site'

export default function PublicPageSettings({ initial }: Props) {
  const router = useRouter()
  const [slug, setSlug] = useState(initial.slug || '')
  const [publicEnabled, setPublicEnabled] = useState(initial.publicEnabled)
  const [brandLogoUrl, setBrandLogoUrl] = useState(initial.brandLogoUrl || '')
  const [brandLogoAltUrl, setBrandLogoAltUrl] = useState(initial.brandLogoAltUrl || '')
  const [brandCoverUrl, setBrandCoverUrl] = useState(initial.brandCoverUrl || '')
  const [brandColor, setBrandColor] = useState(initial.brandColor || BRAND_TERRACOTA_HEX)
  const [brandTheme, setBrandTheme] = useState<'light' | 'dark'>(
    initial.brandTheme === 'dark' ? 'dark' : 'light',
  )
  const [publicDescription, setPublicDescription] = useState(initial.publicDescription || '')
  const [instagramHandle, setInstagramHandle] = useState(initial.instagramHandle || '')
  const [tiktokHandle, setTiktokHandle] = useState(initial.tiktokHandle || '')
  const [facebookUrl, setFacebookUrl] = useState(initial.facebookUrl || '')
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl || '')
  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const publicUrl = slug ? `${SITE_ORIGIN}/${slug}` : ''

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
            brandLogoAltUrl: brandLogoAltUrl.trim() || null,
            brandCoverUrl: brandCoverUrl.trim() || null,
            brandColor,
            brandTheme,
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
        // Re-fetch del Server Component padre (dashboard/app, dashboard/ajustes/...)
        // para que la URL pública, QR, color y resto de campos derivados del
        // `client` server-rendered reflejen los cambios sin recargar la
        // página. Sin esto el usuario veía valores nuevos en el form pero la
        // hero card / preview seguía con los viejos → impresión de "no se
        // guardó".
        router.refresh()
        setTimeout(() => setSaved(false), FEEDBACK_MS.saved)
      } catch {
        setError('Error de red')
      }
    })
  }

  // Layout canónico SlideOver: `flex h-full flex-col` con body scrollable y
  // footer sticky bottom (mismo patrón que ServicesManager / HoursSlideOver).
  // Antes el botón Guardar quedaba en el fondo del scroll y se perdía fuera
  // del viewport cuando el form era largo — el usuario no podía guardar.
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Globe className="h-4 w-4 text-brand" />
          Identidad de tu app
        </h2>
        <p className="text-sm text-ink-2 mt-1">
          Logo, colores, descripción y redes. Todo lo que ve el cliente al abrir
          tu app o escanear el QR. Mismo motor que tu agenda y tu WhatsApp.
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
          App publicada
        </label>
        {!publicEnabled && (
          <p className="text-xs text-warning">
            No publicada: cualquiera que abra tu enlace verá 404. Útil si estás de vacaciones o cerrado.
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
      <FormGrid cols={2}>
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
      </FormGrid>

      {/* Logo alternativo para fondo oscuro — solo se usa si tu color
          principal es oscuro (negro, navy, burdeos). Si no lo subes,
          pintamos el logo principal y punto (puede verse regular). */}
      <ImageUpload
        label="Logo para fondo oscuro (opcional)"
        kind="logo-alt"
        url={brandLogoAltUrl}
        onChange={setBrandLogoAltUrl}
        hint="Si tu color principal tira a oscuro, tu logo negro desaparece. Sube una versión clara (blanco o colores claros sobre transparente) y la usamos automáticamente en esos casos."
        aspect="square"
        darkPreview
      />

      {/* Apariencia — dos decisiones:
          1) Tema: claro u oscuro (fondos/textos neutros)
          2) Color de acento: UN hex que tiñe CTAs, estados seleccionados,
             badges, etc. Es la identidad cromática del barbero. */}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-ink-2 block mb-2">Tema</label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl border border-line bg-overlay max-w-sm">
            <ThemeOption
              label="Claro"
              icon={Sun}
              active={brandTheme === 'light'}
              onClick={() => setBrandTheme('light')}
              previewBg={PUBLIC_PWA_THEME.light.bg}
              previewInk={PUBLIC_PWA_THEME.light.ink}
            />
            <ThemeOption
              label="Oscuro"
              icon={Moon}
              active={brandTheme === 'dark'}
              onClick={() => setBrandTheme('dark')}
              previewBg={PUBLIC_PWA_THEME.dark.bg}
              previewInk={PUBLIC_PWA_THEME.dark.ink}
            />
          </div>
          <p className="text-xs text-ink-3 mt-2">
            Define el fondo y el color del texto. Si eliges oscuro y tu logo no se
            ve sobre fondo negro, sube un logo alternativo arriba.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-2 block mb-2">Color de acento</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-12 w-16 rounded-lg border border-line cursor-pointer shrink-0"
            />
            <div className="flex-1 flex flex-col gap-1">
              <span className="font-mono text-xs text-ink">{brandColor}</span>
              <p className="text-xs text-ink-3">
                Pinta CTAs, servicio seleccionado, hora elegida, badges. Elige un color
                vibrante que represente tu marca: rojo, amarillo, verde, dorado, el que sea.
              </p>
            </div>
            {/* Preview del accent contra ambos temas */}
            <div className="flex gap-1.5 shrink-0">
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: PUBLIC_PWA_THEME.light.bg,
                  color: PUBLIC_PWA_THEME.light.ink,
                  border: `1px solid ${PUBLIC_PWA_THEME.light.border}`,
                }}
                title="Preview en tema claro"
              >
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center"
                  style={{ background: brandColor }}
                />
              </div>
              <div
                className="h-12 w-12 rounded-lg flex items-center justify-center text-[10px] font-bold"
                style={{ background: PUBLIC_PWA_THEME.dark.bg, color: PUBLIC_PWA_THEME.dark.ink }}
                title="Preview en tema oscuro"
              >
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center"
                  style={{ background: brandColor }}
                />
              </div>
            </div>
          </div>
        </div>
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

      <FormGrid cols={2}>
        <Field label="Instagram (sin @)" value={instagramHandle} onChange={setInstagramHandle} placeholder="mi_barberia" />
        <Field label="TikTok (sin @)" value={tiktokHandle} onChange={setTiktokHandle} placeholder="mi_barberia" />
        <Field label="Facebook (URL)" value={facebookUrl} onChange={setFacebookUrl} placeholder="https://facebook.com/..." />
        <Field label="Web externa" value={websiteUrl} onChange={setWebsiteUrl} placeholder="https://mi-barberia.com" />
      </FormGrid>
      </div>

      {/* Footer sticky — siempre visible aunque el form sea más largo que el
          viewport. Antes el botón quedaba al fondo del scroll del SlideOver
          y el usuario no podía guardar en pantallas pequeñas / formularios
          completos. Mismo patrón que ServicesManager / HoursSlideOver. */}
      <div className="shrink-0 border-t border-line bg-surface px-5 py-3 flex items-center justify-end gap-3">
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
          className="btn-primary"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}

function ThemeOption({
  label,
  icon: Icon,
  active,
  onClick,
  previewBg,
  previewInk,
}: {
  label: string
  icon: typeof Sun
  active: boolean
  onClick: () => void
  previewBg: string
  previewInk: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
        active ? 'bg-surface shadow-sm ring-1 ring-brand' : 'hover:bg-surface/50'
      }`}
      aria-pressed={active}
    >
      <span
        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 border"
        style={{ background: previewBg, color: previewInk, borderColor: active ? previewInk + '20' : 'transparent' }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className={active ? 'text-ink' : 'text-ink-2'}>{label}</span>
    </button>
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
  darkPreview,
}: {
  label: string
  kind: 'logo' | 'logo-alt' | 'cover'
  url: string
  onChange: (next: string) => void
  hint?: string
  aspect: 'square' | 'wide'
  /** Pinta el preview con fondo oscuro — para logos alternativos que sólo
   *  se usan sobre fondo oscuro. Así el barbero ve si su versión clara
   *  funciona antes de publicar. */
  darkPreview?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      // Client upload: browser gets a short-lived token from our endpoint
      // then PUTs directly to Blob. Bypasses the 4.5 MB Vercel Function
      // body limit (a smartphone cover photo is often 3-5 MB).
      const ext = (file.type.split('/')[1] || 'bin').toLowerCase()
      const filename = `${kind}.${ext}`
      const blob = await upload(filename, file, {
        access: 'public',
        handleUploadUrl: '/api/public-page/upload',
        contentType: file.type,
      })
      onChange(blob.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-ink-2">{label}</label>
      <div
        className={`relative border border-line rounded-lg overflow-hidden ${
          aspect === 'square' ? 'aspect-square max-w-[180px]' : 'aspect-[16/6]'
        } flex items-center justify-center ${darkPreview ? '' : 'bg-overlay'}`}
        style={darkPreview ? { background: PUBLIC_PWA_THEME.dark.editorPreviewBg } : undefined}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className={`text-xs ${darkPreview ? 'text-white/40' : 'text-ink-3'}`}>
            Sin imagen
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-[var(--color-scrim-light)] flex items-center justify-center">
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
