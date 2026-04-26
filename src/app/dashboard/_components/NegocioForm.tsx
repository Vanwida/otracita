'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Store, Scissors, Users, Clock, CalendarX, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import ServicesManager from './ServicesManager'
import BarbersManager from './BarbersManager'
import HoursEditor, { type HoursMap } from './HoursEditor'
import BlockedDatesManager from './BlockedDatesManager'

interface ServiceItem {
  name: string
  duration: number | string
  price: number | string
}

interface Props {
  clientId: string
  initial: {
    businessName: string
    whatsappNumber: string
    phone: string
    address: string
    services: ServiceItem[]
    // Team is managed by BarbersManager (own API-driven CRUD). No initial
    // barbers array plumbed through here — the component fetches from
    // /api/barbers on mount.
    hours: HoursMap | null
    slotStepMinutes: number
    blockedDates: string[]
  }
  /** Server action that saves the core business fields. Datos fiscales y
   *  Cobros Stripe Connect viven ahora en /dashboard/caja con sus propios
   *  endpoints (/api/invoicing/config y /api/stripe/connect/*). */
  save: (formData: FormData) => Promise<void>
}

type TabKey = 'info' | 'services' | 'team' | 'hours' | 'blocked'

interface Tab {
  key: TabKey
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { key: 'info', label: 'Información', icon: Store },
  { key: 'services', label: 'Servicios', icon: Scissors },
  { key: 'team', label: 'Equipo', icon: Users },
  { key: 'hours', label: 'Horario', icon: Clock },
  { key: 'blocked', label: 'Días bloqueados', icon: CalendarX },
]

/**
 * Unified business settings form with horizontal tabs.
 *
 * Tabs 1-4 (info / services / team / hours) live inside a single <form>
 * so the user can edit one, jump to another, and save once. Tab 5 (blocked
 * dates) uses the existing API-driven component and saves independently.
 */
export default function NegocioForm({ clientId, initial, save }: Props) {
  const [tab, setTab] = useState<TabKey>('info')
  const [saving, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  // Refs para auto-scrollear el tab activo a vista — indispensable cuando el
  // ancho de pantalla obliga a overflow-x horizontal (mobile o desktop a
  // resolución media). Sin esto, al deep-linkear a ?tab=blocked el tab queda
  // fuera de la zona visible.
  const tabBtnRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    info: null, services: null, team: null, hours: null, blocked: null,
  })

  // Allow deep-linking: ?tab=blocked lands en el tab correspondiente.
  // Las viejas tabs ?tab=facturacion y ?tab=cobros se redirigen a /dashboard/caja
  // (vivien ahí desde commit 4) — handled abajo.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('tab')
    if (!raw) return
    // Redirección legacy: enlaces externos viejos llegan a estas tabs.
    if (raw === 'facturacion' || raw === 'cobros') {
      window.location.replace('/dashboard/caja')
      return
    }
    const valid: TabKey[] = ['info', 'services', 'team', 'hours', 'blocked']
    if ((valid as string[]).includes(raw)) {
      setTab(raw as TabKey)
    }
  }, [])

  // Al cambiar de tab, centra el botón activo en la vista horizontal si es
  // que el contenedor tiene scroll. En desktop ancho no hace nada (no hay
  // overflow); en anchos reducidos evita que el tab activo quede fuera.
  useEffect(() => {
    const btn = tabBtnRefs.current[tab]
    if (!btn) return
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [tab])

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      await save(formData)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="space-y-6">
      {/* Tabs — overflow horizontal con scroll auto al tab activo.
          El contenedor externo aplica un mask gradiente que afila los bordes
          izquierdo/derecho cuando hay overflow, señal visual clara de que
          la fila se puede seguir hacia los lados. */}
      <div
        className="relative -mx-4 md:mx-0 border-b border-line"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
        }}
      >
        <div className="flex items-center gap-2 overflow-x-auto px-4 md:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                ref={(el) => { tabBtnRefs.current[key] = el }}
                type="button"
                onClick={() => setTab(key)}
                aria-selected={active}
                role="tab"
                className={`shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-brand text-ink'
                    : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'blocked' ? (
        <div className="bg-surface border border-line rounded-xl p-4 md:p-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Días bloqueados</h2>
            <p className="text-sm text-ink-2 mt-1">Bloquea fechas específicas (vacaciones, festivos) para que el bot no ofrezca esos días.</p>
          </div>
          <BlockedDatesManager initialDates={initial.blockedDates} clientId={clientId} />
        </div>
      ) : (
        <form action={onSubmit} className="bg-surface border border-line rounded-xl p-4 md:p-8 space-y-6">
          {/* ─── Información ─── */}
          <div className={tab === 'info' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Información del negocio</h2>
              <p className="text-sm text-ink-2 mt-1">Los datos que el bot usa para presentarse a tus clientes.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                name="businessName"
                label="Nombre del negocio"
                defaultValue={initial.businessName}
                placeholder="Ej. Barbería Central"
                required
              />
              <Field
                name="whatsappNumber"
                label="WhatsApp (con código de país)"
                defaultValue={initial.whatsappNumber || initial.phone}
                placeholder="+34 600 123 456"
                required
              />
            </div>

            <Field
              name="address"
              label="Dirección"
              defaultValue={initial.address}
              placeholder="Calle Gran Vía 123, Barcelona"
            />
          </div>

          {/* ─── Servicios ─── */}
          <div className={tab === 'services' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Servicios</h2>
              <p className="text-sm text-ink-2 mt-1">Los servicios que ofrece tu negocio. El bot los usará para las reservas.</p>
            </div>
            <ServicesManager initial={initial.services.map((s) => ({ name: String(s.name), duration: s.duration, price: s.price }))} />
          </div>

          {/* ─── Equipo ─── */}
          <div className={tab === 'team' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Equipo</h2>
              <p className="text-sm text-ink-2 mt-1">Profesionales del negocio. El bot preguntará con quién quiere reservar el cliente.</p>
            </div>
            <BarbersManager />
          </div>

          {/* ─── Horario ─── */}
          <div className={tab === 'hours' ? 'space-y-6' : 'hidden'}>
            <div>
              <h2 className="text-lg font-semibold text-ink">Horario</h2>
              <p className="text-sm text-ink-2 mt-1">Horas de apertura por día. El bot solo ofrecerá huecos dentro de este rango.</p>
            </div>
            <HoursEditor initial={initial.hours} />

            <div className="pt-4 border-t border-line">
              <h3 className="text-sm font-semibold text-ink">Granularidad de los huecos</h3>
              <p className="text-xs text-ink-2 mt-1 mb-3">
                Cada cuántos minutos ofrecemos un posible inicio de cita. 15 min
                (recomendado) rellena micro-huecos y maximiza conversión —
                nunca ofreceremos un slot que no quepa entero.
              </p>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {([15, 30, 45] as const).map((m) => (
                  <label
                    key={m}
                    className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm cursor-pointer hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-softer has-[:checked]:text-ink"
                  >
                    <input
                      type="radio"
                      name="slotStepMinutes"
                      value={m}
                      defaultChecked={(initial.slotStepMinutes ?? 15) === m}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-medium">{m} min</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Facturación y Cobros vivían aquí — movidos a /dashboard/caja
              (commit 4) con InvoicingSettings y ConnectSettings ya
              self-contained con sus propios endpoints API. */}

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-line">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Check className="h-4 w-4" />
                Guardado
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand hover:bg-brand-strong px-6 py-3 text-sm font-semibold text-brand-ink transition-colors disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  type = 'text',
}: {
  name: string
  label: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  type?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium text-ink-2">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue || ''}
        placeholder={placeholder}
        required={required}
        className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
      />
    </div>
  )
}
