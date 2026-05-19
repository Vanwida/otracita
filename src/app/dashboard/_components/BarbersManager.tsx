'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { upload } from '@vercel/blob/client'
import {
  Plus,
  Trash2,
  Loader2,
  Calendar,
  Clock,
  X,
  Camera,
  User,
  AlertTriangle,
  Search,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Wallet,
  Scissors,
  Globe,
  Shield,
  FileText,
  Pencil,
  Check,
} from 'lucide-react'
import Modal from './Modal'
import HoursEditor, { type HoursMap } from './HoursEditor'
import { useConfirm } from './ConfirmDialog'
import BarberSalaryEditor from './BarberSalaryEditor'

// -----------------------------------------------------------------------------
// BarbersManager — Equipo > Empleados en patrón MASTER-DETAIL (Booksy
// "Empleados", screenshots 10.16.45 / 10.16.58).
//
//   · Izquierda: lista buscable del equipo. Cada fila = handle de arrastre +
//     avatar + nombre + rol. La fila seleccionada queda activa; arrastrar
//     reordena el displayOrder (orden de columnas de la agenda, desempate de
//     "cualquiera", orden de la lista del bot). Botón "+ Añadir" al pie.
//   · Derecha: panel de detalle del barbero seleccionado — avatar grande,
//     nombre, rol, y secciones (Foto · Horario · Días bloqueados · Perfil de
//     pago). Antes era un acordeón de tarjetas apiladas; ahora un split que
//     no obliga a scrollear una página larga (regla AreaShell).
//
// La capa de datos es idéntica a la anterior (SWR sobre /api/barbers,
// PATCH/DELETE por barbero, ReassignModal al borrar con citas futuras). Solo
// cambia el SHELL: de cards expandibles a master-detail. Drag-reorder
// reemplaza los botones ↑↓ del modelo viejo (Booksy usa handle de arrastre);
// las flechas siguen disponibles, ocultas, para reorden por teclado.
// -----------------------------------------------------------------------------

interface BarberRow {
  id: string
  clientId: string
  name: string
  photoUrl: string | null
  hours: HoursMap | null
  blockedDates: string[]
  displayOrder: number
  active: boolean
  // Perfil Booksy del empleado.
  bio: string | null
  role: string | null
  permissionLevel: 'empleado' | 'admin'
  onlineBookable: boolean
  // Perfil de pago — feature Pro. Null en salaryType = sin configurar.
  salaryType: 'fijo' | 'mixto' | 'autonomo' | null
  salaryBaseCents: number
  commissionServicesPct: number
  commissionProductsPct: number
  chairRentCents: number
  createdAt: string
  updatedAt: string
}

/** Servicio del catálogo del local (jsonb, match por nombre). */
interface ServiceCatalogItem {
  name: string
  duration: number
  price: number
}

interface BlockingBooking {
  id: string
  date: string
  time: string
  service: string
  duration: number
  customerName: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<{ barbers: BarberRow[] }>)

interface BarbersManagerProps {
  /** True si el tenant tiene `controlFinanciero` (Pro+) — desbloquea el
   *  panel "Cómo cobra" dentro de cada barbero. Si false, el panel se
   *  oculta y el resto del editor de barberos funciona igual. */
  payrollEnabled?: boolean
  /** Catálogo de servicios del local (para la asignación por barbero). */
  serviceCatalog?: ServiceCatalogItem[]
}

export default function BarbersManager({
  payrollEnabled = false,
  serviceCatalog = [],
}: BarbersManagerProps = {}) {
  const { data, mutate, isLoading } = useSWR('/api/barbers', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  })

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Estado del modal de reasignación — se abre cuando un borrado falla por
  // tener reservas futuras. Contiene la lista de reservas y el barbero a
  // borrar. El usuario reasigna/cancela y luego reintenta el borrado.
  const [reassignModal, setReassignModal] = useState<null | {
    barberId: string
    barberName: string
    blockingBookings: BlockingBooking[]
  }>(null)
  const confirm = useConfirm()

  const barbers = useMemo(() => data?.barbers ?? [], [data])

  // Garantiza siempre una selección válida: el master-detail nunca muestra
  // el panel vacío si hay equipo (primera carga, borrado, reorden).
  useEffect(() => {
    if (barbers.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (!selectedId || !barbers.some((b) => b.id === selectedId)) {
      setSelectedId(barbers[0].id)
    }
  }, [barbers, selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return barbers
    return barbers.filter((b) => b.name.toLowerCase().includes(q))
  }, [barbers, query])

  const selected = barbers.find((b) => b.id === selectedId) ?? null

  const addBarber = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/barbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErrorMsg(body?.error || 'No se pudo añadir.')
      } else {
        setNewName('')
        await mutate()
        if (body?.barber?.id) setSelectedId(body.barber.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const patchBarber = async (id: string, patch: Partial<BarberRow>) => {
    setBusyId(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/barbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body?.error || 'No se pudo guardar.')
      }
      await mutate()
    } finally {
      setBusyId(null)
    }
  }

  const deleteBarber = async (id: string, name: string) => {
    const ok = await confirm({
      title: `¿Eliminar a ${name}?`,
      message: 'Se quitará del equipo. Si tiene citas futuras te pediremos reasignarlas o cancelarlas antes.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    setBusyId(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/barbers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Si el API devuelve la lista de reservas bloqueantes, abrimos modal
        // para reasignar/cancelar una a una. Si no, fallback a error inline.
        if (res.status === 409 && Array.isArray(body?.blockingBookings) && body.blockingBookings.length > 0) {
          setReassignModal({
            barberId: id,
            barberName: name,
            blockingBookings: body.blockingBookings,
          })
        } else {
          setErrorMsg(body?.error || 'No se pudo eliminar.')
        }
      }
      await mutate()
    } finally {
      setBusyId(null)
    }
  }

  /** Invocado por el modal tras reasignar o cancelar una reserva: actualiza
   *  la lista bloqueante. Si queda vacía, cierra el modal y reintenta
   *  borrar al barbero. */
  const removeBlocking = (bookingId: string) => {
    setReassignModal((prev) => {
      if (!prev) return prev
      const next = prev.blockingBookings.filter((b) => b.id !== bookingId)
      if (next.length === 0) {
        // Todas reasignadas/canceladas — reintenta borrado en background.
        void (async () => {
          await fetch(`/api/barbers/${prev.barberId}`, { method: 'DELETE' })
          await mutate()
        })()
        return null
      }
      return { ...prev, blockingBookings: next }
    })
  }

  /** Reordena la lista completa y persiste el displayOrder de cada barbero
   *  (0..n-1). Lo llaman el drag-drop y las flechas accesibles. Optimista
   *  vía mutate(); revalida al terminar. */
  const reorder = async (orderedIds: string[]) => {
    const byId = new Map(barbers.map((b) => [b.id, b]))
    const next = orderedIds
      .map((id, idx) => {
        const b = byId.get(id)
        return b ? { ...b, displayOrder: idx } : null
      })
      .filter((b): b is BarberRow => b !== null)
    // Pinta el nuevo orden ya (sin esperar al server).
    await mutate({ barbers: next }, { revalidate: false })
    setErrorMsg(null)
    try {
      await Promise.all(
        next.map((b, idx) =>
          fetch(`/api/barbers/${b.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayOrder: idx }),
          }),
        ),
      )
    } catch {
      setErrorMsg('No se pudo guardar el orden. Inténtalo de nuevo.')
    } finally {
      await mutate()
    }
  }

  const moveBy = (id: string, dir: -1 | 1) => {
    const ids = barbers.map((b) => b.id)
    const idx = ids.indexOf(id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    void reorder(ids)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {errorMsg && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {errorMsg}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* ── Master: lista buscable del equipo ──────────────────────────── */}
        <div className="flex w-72 shrink-0 flex-col rounded-control border border-line bg-surface">
          <div className="border-b border-line p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar empleados…"
                aria-label="Buscar empleados"
                className="w-full rounded-lg border border-line bg-canvas py-2 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading && barbers.length === 0 && (
              <p className="px-2 py-3 text-xs text-ink-3">Cargando equipo…</p>
            )}
            {!isLoading && barbers.length === 0 && (
              <p className="px-2 py-3 text-xs text-ink-3">
                Aún no has añadido a nadie. Añade al primer barbero abajo.
              </p>
            )}
            {barbers.length > 0 && filtered.length === 0 && (
              <p className="px-2 py-3 text-xs text-ink-3">Nadie coincide con «{query}».</p>
            )}

            <ul className="space-y-0.5">
              {filtered.map((b) => (
                <BarberListItem
                  key={b.id}
                  barber={b}
                  selected={b.id === selectedId}
                  busy={busyId === b.id}
                  // Drag solo sin filtro (reordenar sobre un subconjunto es
                  // ambiguo). Con filtro: solo selección.
                  draggable={!query.trim()}
                  index={barbers.indexOf(b)}
                  total={barbers.length}
                  allIds={barbers.map((x) => x.id)}
                  onSelect={() => setSelectedId(b.id)}
                  onReorder={reorder}
                  onMoveUp={() => moveBy(b.id, -1)}
                  onMoveDown={() => moveBy(b.id, 1)}
                />
              ))}
            </ul>
          </div>

          <div className="border-t border-line p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addBarber()
                  }
                }}
                placeholder="Nombre del profesional"
                className="min-w-0 flex-1 rounded-lg border border-line bg-canvas p-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand"
                disabled={creating}
              />
              <button
                type="button"
                onClick={addBarber}
                disabled={creating || !newName.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-espresso)] px-3 py-2 text-sm font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-espresso-2)] disabled:opacity-60"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Añadir
              </button>
            </div>
          </div>
        </div>

        {/* ── Detalle del barbero seleccionado ───────────────────────────── */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-control border border-line bg-surface">
          {selected ? (
            <BarberDetail
              key={selected.id}
              barber={selected}
              busy={busyId === selected.id}
              payrollEnabled={payrollEnabled}
              serviceCatalog={serviceCatalog}
              onPatch={(patch) => patchBarber(selected.id, patch)}
              onDelete={() => deleteBarber(selected.id, selected.name)}
              onSalaryUpdated={() => mutate()}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <User className="mb-3 h-7 w-7 text-ink-3" />
              <p className="text-sm text-ink-2">
                {isLoading
                  ? 'Cargando equipo…'
                  : 'Añade a tu primer profesional para empezar.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {reassignModal && (
        <ReassignModal
          barberName={reassignModal.barberName}
          blockingBookings={reassignModal.blockingBookings}
          otherBarbers={barbers.filter((b) => b.id !== reassignModal.barberId)}
          onResolved={removeBlocking}
          onClose={() => setReassignModal(null)}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// BarberListItem — fila de la lista master. Handle de arrastre + avatar +
// nombre + rol. Drag-and-drop nativo (sin dependencia): al soltar sobre otra
// fila, recompone el orden y lo persiste vía onReorder. Flechas ↑↓ ocultas
// (teclado / lectores de pantalla) para que el reorden sea accesible.
// -----------------------------------------------------------------------------
function BarberListItem({
  barber,
  selected,
  busy,
  draggable,
  index,
  total,
  allIds,
  onSelect,
  onReorder,
  onMoveUp,
  onMoveDown,
}: {
  barber: BarberRow
  selected: boolean
  busy: boolean
  draggable: boolean
  index: number
  total: number
  allIds: string[]
  onSelect: () => void
  onReorder: (orderedIds: string[]) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <li>
      <div
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', barber.id)
        }}
        onDragOver={(e) => {
          if (!draggable) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (!dragOver) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const draggedId = e.dataTransfer.getData('text/plain')
          if (!draggedId || draggedId === barber.id) return
          const next = allIds.filter((id) => id !== draggedId)
          const targetIdx = next.indexOf(barber.id)
          next.splice(targetIdx, 0, draggedId)
          onReorder(next)
        }}
        className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
          selected ? 'bg-brand-softer ring-1 ring-brand/30' : 'hover:bg-overlay/60'
        } ${dragOver ? 'ring-1 ring-brand' : ''}`}
      >
        {draggable ? (
          <span
            className="shrink-0 cursor-grab text-ink-3 opacity-40 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            aria-hidden="true"
            title="Arrastra para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-current={selected ? 'true' : undefined}
        >
          {barber.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={barber.photoUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-line object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-overlay text-xs font-bold text-ink-2">
              {barber.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{barber.name}</span>
            <span className="block truncate text-[11px] uppercase tracking-wide text-ink-3">
              {barber.role?.trim() || 'Profesional'}
            </span>
          </span>
        </button>

        {/* Reorden accesible por teclado (oculto; el handle cubre el ratón).
            Solo sin filtro de búsqueda. */}
        {draggable && (
          <span className="flex shrink-0 flex-col opacity-0 focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0 || busy}
              aria-label={`Subir a ${barber.name}`}
              className="text-ink-3 hover:text-ink disabled:opacity-30"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1 || busy}
              aria-label={`Bajar a ${barber.name}`}
              className="text-ink-3 hover:text-ink disabled:opacity-30"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
    </li>
  )
}

// -----------------------------------------------------------------------------
// BarberDetail — panel derecho. Cabecera (avatar + nombre + rol + acciones) +
// secciones de edición. Misma sustancia que el antiguo acordeón, pero como
// detalle persistente del seleccionado (no apila tarjetas en una página
// larga).
// -----------------------------------------------------------------------------
function BarberDetail({
  barber,
  busy,
  payrollEnabled,
  serviceCatalog,
  onPatch,
  onDelete,
  onSalaryUpdated,
}: {
  barber: BarberRow
  busy: boolean
  payrollEnabled: boolean
  serviceCatalog: ServiceCatalogItem[]
  onPatch: (patch: Partial<BarberRow>) => Promise<void>
  onDelete: () => void
  onSalaryUpdated: () => void
}) {
  // Estado de drafts inicializado desde props. NO necesita re-sync por
  // efecto: el padre monta este componente con `key={selected.id}`, así que
  // cambiar de barbero ya fuerza un remount con inicializadores frescos
  // (idioma React preferido sobre setState-in-effect).
  const [nameDraft, setNameDraft] = useState(barber.name)
  const [roleDraft, setRoleDraft] = useState(barber.role ?? '')
  const [bioDraft, setBioDraft] = useState(barber.bio ?? '')
  const [blockedDraft, setBlockedDraft] = useState('')
  const [customHours, setCustomHours] = useState(barber.hours !== null)
  const [hoursFormKey, setHoursFormKey] = useState(0)

  const onRoleBlur = () => {
    const next = roleDraft.trim()
    if (next !== (barber.role ?? '')) onPatch({ role: next || null })
  }

  const onBioBlur = () => {
    const next = bioDraft.trim()
    if (next !== (barber.bio ?? '')) onPatch({ bio: next || null })
  }

  const onNameBlur = () => {
    const name = nameDraft.trim()
    if (name && name !== barber.name) onPatch({ name })
    else if (!name) setNameDraft(barber.name)
  }

  const addBlocked = () => {
    const date = blockedDraft.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    if (barber.blockedDates.includes(date)) return
    onPatch({ blockedDates: [...barber.blockedDates, date].sort() })
    setBlockedDraft('')
  }

  const removeBlocked = (date: string) => {
    onPatch({ blockedDates: barber.blockedDates.filter((d) => d !== date) })
  }

  const onCustomHoursToggle = (next: boolean) => {
    setCustomHours(next)
    if (!next) onPatch({ hours: null })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera del detalle */}
      <div className="flex items-start gap-4 border-b border-line p-5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-line bg-overlay">
          {barber.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={barber.photoUrl}
              alt={barber.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-bold text-ink-2">
              {barber.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={onNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            aria-label="Nombre del profesional"
            className="w-full border-0 bg-transparent px-0 text-lg font-semibold text-ink outline-none focus:ring-0"
          />
          {/* Puesto editable (Booksy "TOP BARBER" bajo el nombre). Vacío
              ⇒ placeholder; al guardar null se muestra como sin puesto. */}
          <input
            type="text"
            value={roleDraft}
            onChange={(e) => setRoleDraft(e.target.value)}
            onBlur={onRoleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            aria-label="Puesto del profesional"
            placeholder="Añadir puesto (p. ej. Top barber)"
            className="mt-0.5 w-full border-0 bg-transparent px-0 text-xs font-semibold uppercase tracking-wide text-ink-2 outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-ink-3 focus:ring-0"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {busy && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando…
            </span>
          )}
          {/* Nóminas accesible desde Equipo: el ex-Booksy busca lo que cobra
              el equipo bajo Empleados. No duplicamos el componente Payroll —
              enlazamos a Informes>Nóminas (su sitio canónico). Solo visible
              con payroll (Pro), mismo gate que esa página. */}
          {payrollEnabled && (
            <Link
              href="/dashboard/informes/nominas"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              <Wallet className="h-3.5 w-3.5" />
              Ver nóminas
            </Link>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-md p-2 text-ink-3 transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            aria-label={`Eliminar ${barber.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Cuerpo del detalle */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        {/* ── Foto ──────────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
            <Camera className="h-4 w-4 text-ink-2" />
            Foto
          </div>
          <BarberPhotoUpload
            url={barber.photoUrl}
            onChange={(next) => onPatch({ photoUrl: next })}
          />
        </section>

        {/* ── Servicios que hace ───────────────────────────────────────── */}
        <section>
          <BarberServicesEditor
            barberId={barber.id}
            catalog={serviceCatalog}
          />
        </section>

        {/* ── Perfil (descripción · permiso · reservas online) ──────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <FileText className="h-4 w-4 text-ink-2" />
            Perfil
          </div>

          <div>
            <label
              htmlFor={`bio-${barber.id}`}
              className="mb-1.5 block text-xs font-semibold text-ink-2"
            >
              Descripción
            </label>
            <textarea
              id={`bio-${barber.id}`}
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value.slice(0, 1000))}
              onBlur={onBioBlur}
              rows={3}
              placeholder="Años de experiencia, especialidades, idiomas…"
              className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand"
            />
            <p className="mt-1 text-xs text-ink-3">
              Aparece en la app al elegir profesional.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <label
                htmlFor={`perm-${barber.id}`}
                className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-2"
              >
                <Shield className="h-3.5 w-3.5" />
                Nivel de permiso
              </label>
              <select
                id={`perm-${barber.id}`}
                value={barber.permissionLevel}
                onChange={(e) =>
                  onPatch({ permissionLevel: e.target.value as BarberRow['permissionLevel'] })
                }
                className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="empleado">Empleado</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={barber.onlineBookable}
                onChange={(e) => onPatch({ onlineBookable: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              <Globe className="h-4 w-4 text-ink-2" />
              Disponible para reservas online
            </label>
          </div>
        </section>

        {/* ── Horario ───────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <Clock className="h-4 w-4 text-ink-2" />
              Horario
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={customHours}
                onChange={(e) => onCustomHoursToggle(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              Horario personalizado
            </label>
          </div>
          {customHours ? (
            <BarberHoursEditor
              key={hoursFormKey}
              initial={barber.hours}
              onChange={(next) => onPatch({ hours: next })}
              onReset={() => {
                onPatch({ hours: null })
                setCustomHours(false)
                setHoursFormKey((k) => k + 1)
              }}
            />
          ) : (
            <p className="text-xs text-ink-3">
              Hereda el horario del negocio. Actívalo para configurar uno propio.
            </p>
          )}
        </section>

        {/* ── Días bloqueados ───────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
            <Calendar className="h-4 w-4 text-ink-2" />
            Días bloqueados personales
          </div>
          <p className="mb-2 text-xs text-ink-3">
            Vacaciones, días libres, bajas. Se suman a los días bloqueados del negocio.
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            {barber.blockedDates.length === 0 && (
              <span className="text-xs text-ink-3">Sin días bloqueados.</span>
            )}
            {barber.blockedDates.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-xs"
              >
                {d}
                <button
                  type="button"
                  onClick={() => removeBlocked(d)}
                  className="text-ink-3 hover:text-danger"
                  aria-label={`Quitar ${d}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={blockedDraft}
              onChange={(e) => setBlockedDraft(e.target.value)}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={addBlocked}
              disabled={!blockedDraft || busy}
              className="rounded-lg border border-line bg-overlay px-3 py-2 text-sm text-ink hover:border-line-strong hover:bg-canvas disabled:opacity-50"
            >
              Añadir día
            </button>
          </div>
        </section>

        {/* ── Perfil de pago ────────────────────────────────────────────── */}
        {payrollEnabled && (
          <section className="border-t border-line pt-5">
            <BarberSalaryEditor
              barberId={barber.id}
              initial={{
                salaryType: barber.salaryType,
                salaryBaseCents: barber.salaryBaseCents,
                commissionServicesPct: barber.commissionServicesPct,
                commissionProductsPct: barber.commissionProductsPct,
                chairRentCents: barber.chairRentCents,
              }}
              onSaved={onSalaryUpdated}
            />
          </section>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// ReassignModal — modal para resolver reservas bloqueantes al intentar
// eliminar un barbero. Cada reserva muestra: servicio, fecha/hora, cliente,
// + dropdown de otros barberos para reasignar + botón de cancelar. Al
// resolver todas, el modal se cierra y el borrado del barbero se reintenta.
// -----------------------------------------------------------------------------
function ReassignModal({
  barberName,
  blockingBookings,
  otherBarbers,
  onResolved,
  onClose,
}: {
  barberName: string
  blockingBookings: BlockingBooking[]
  otherBarbers: BarberRow[]
  onResolved: (bookingId: string) => void
  onClose: () => void
}) {
  return (
    <Modal
      open
      onClose={onClose}
      ariaLabel={`Resuelve las reservas de ${barberName}`}
      size="xl"
      footer={
        <div className="text-right">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-ink-2 hover:text-ink underline"
          >
            Cerrar sin eliminar
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3 p-5 border-b border-line">
        <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-5 w-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-ink">
            Resuelve las reservas de {barberName}
          </h3>
          <p className="text-sm text-ink-2 mt-0.5">
            Tiene {blockingBookings.length} reserva{blockingBookings.length === 1 ? '' : 's'}{' '}
            futura{blockingBookings.length === 1 ? '' : 's'}. Reasigna o cancela cada una
            para poder eliminarlo.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="text-ink-3 hover:text-ink p-1 -m-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-2">
        {blockingBookings.map((b) => (
          <BlockingBookingRow
            key={b.id}
            booking={b}
            otherBarbers={otherBarbers}
            onResolved={() => onResolved(b.id)}
          />
        ))}
      </div>
    </Modal>
  )
}

function BlockingBookingRow({
  booking,
  otherBarbers,
  onResolved,
}: {
  booking: BlockingBooking
  otherBarbers: BarberRow[]
  onResolved: () => void
}) {
  const [targetBarberId, setTargetBarberId] = useState<string>(otherBarbers[0]?.id || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const confirm = useConfirm()

  const reassign = async () => {
    setBusy(true)
    setErr(null)
    try {
      const body: { barberId: string | null } = {
        barberId: targetBarberId === 'any' ? null : targetBarberId,
      }
      const r = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErr(d?.error || 'No se pudo reasignar.')
        return
      }
      onResolved()
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    const ok = await confirm({
      title: '¿Cancelar esta reserva?',
      message: 'El cliente no recibe aviso automático. Avísale tú si hace falta.',
      confirmLabel: 'Sí, cancelar',
      variant: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErr(d?.error || 'No se pudo cancelar.')
        return
      }
      onResolved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-overlay/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm text-ink truncate">
            {booking.service} · {booking.duration} min
          </p>
          <p className="text-xs text-ink-2 mt-0.5">
            {booking.date} a las {booking.time} · {booking.customerName}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={targetBarberId}
          onChange={(e) => setTargetBarberId(e.target.value)}
          disabled={busy}
          className="flex-1 min-w-[140px] bg-surface border border-line rounded-lg px-2.5 py-1.5 text-xs text-ink focus:border-brand outline-none"
        >
          {otherBarbers.length > 0 && (
            <>
              {otherBarbers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </>
          )}
          <option value="any">Cualquiera (asigna automática)</option>
        </select>
        <button
          type="button"
          onClick={reassign}
          disabled={busy || !targetBarberId}
          className="btn-primary btn-sm"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Reasignar
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface hover:bg-danger/10 hover:border-danger hover:text-danger px-3 py-1.5 text-xs font-medium text-ink-2 disabled:opacity-60"
        >
          Cancelar cita
        </button>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  )
}

// -----------------------------------------------------------------------------
// BarberPhotoUpload — preview + upload/quitar de la foto del barbero.
// Usa el mismo handler /api/public-page/upload que logos/cover (client upload
// vía Vercel Blob). El URL resultante se guarda en barbers.photo_url.
// -----------------------------------------------------------------------------
function BarberPhotoUpload({
  url,
  onChange,
}: {
  url: string | null
  onChange: (next: string | null) => void | Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (file: File) => {
    setError(null)
    setUploading(true)
    try {
      const ext = (file.type.split('/')[1] || 'bin').toLowerCase()
      const filename = `barber.${ext}`
      const blob = await upload(filename, file, {
        access: 'public',
        handleUploadUrl: '/api/public-page/upload',
        contentType: file.type,
      })
      await onChange(blob.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="relative h-20 w-20 rounded-lg overflow-hidden bg-overlay border border-line shrink-0 flex items-center justify-center">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Foto del barbero" className="h-full w-full object-cover" />
        ) : (
          <User className="h-8 w-8 text-ink-3" />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-[var(--color-scrim)] flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-2 hover:text-ink cursor-pointer transition-colors">
            <Camera className="h-3.5 w-3.5" />
            {url ? 'Reemplazar' : 'Subir foto'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
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
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-canvas px-3 py-2 text-xs font-medium text-ink-3 hover:text-danger transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar
            </button>
          )}
        </div>
        <p className="text-xs text-ink-3 mt-1.5">
          Retrato del barbero. Cuadrada ideal, PNG/JPG/WEBP, máx. 3 MB. Aparece en
          la app al elegir &ldquo;con quién&rdquo;.
        </p>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// BarberHoursEditor — thin wrapper around HoursEditor in controlled mode.
// HoursEditor now exposes an onChange prop so we save per-barber directly.
// -----------------------------------------------------------------------------
function BarberHoursEditor({
  initial,
  onChange,
  onReset,
}: {
  initial: HoursMap | null
  onChange: (next: HoursMap) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-3">
      <HoursEditor initial={initial} onChange={onChange} />
      <button
        type="button"
        onClick={onReset}
        className="text-xs text-ink-3 hover:text-ink underline"
      >
        Volver al horario del negocio
      </button>
    </div>
  )
}

// -----------------------------------------------------------------------------
// BarberServicesEditor — "SERVICIOS" del detalle Booksy (10.16.45/58): qué
// servicios HACE este barbero. Lista PLANA del catálogo (decisión: el jsonb
// no tiene categoría/ID estable; agrupar por categoría es follow-up P2).
//
// Modo lectura: muestra lo asignado (o "Hace todos los servicios" si vacío —
// la semántica del schema). "EDITAR SERVICIOS" entra en modo edición con
// checkboxes; "Guardar" hace PUT del set completo (mismo patrón que breaks).
//
// SWR propio (la lista vive en otra tabla, no en /api/barbers) — se revalida
// solo y no acopla con el resto del detalle.
// -----------------------------------------------------------------------------
const servicesFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ services: string[] }>)

function BarberServicesEditor({
  barberId,
  catalog,
}: {
  barberId: string
  catalog: ServiceCatalogItem[]
}) {
  const { data, mutate, isLoading } = useSWR(
    `/api/barbers/${barberId}/services`,
    servicesFetcher,
  )
  const assigned = data?.services ?? []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doesAll = assigned.length === 0

  const fmtPrice = (eur: number) =>
    eur > 0 ? `${eur.toFixed(2).replace('.', ',')} €` : '—'
  const fmtDur = (min: number) => (min > 0 ? `${min} min` : '')

  function startEdit() {
    // Estado inicial del borrador: si no hay asignación explícita, parte de
    // "todos marcados" (refleja la semántica "sin filas = hace todo" y deja
    // al dueño desmarcar lo que no hace).
    setDraft(new Set(doesAll ? catalog.map((s) => s.name) : assigned))
    setError(null)
    setEditing(true)
  }

  function toggle(name: string) {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      // Si están TODOS marcados, guardamos lista vacía = "hace todos"
      // (canónico; evita que añadir un servicio nuevo al catálogo lo deje
      // fuera de este barbero por omisión).
      const all = catalog.length > 0 && catalog.every((s) => draft.has(s.name))
      const services = all ? [] : Array.from(draft)
      const res = await fetch(`/api/barbers/${barberId}/services`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d?.error || 'No se pudo guardar.')
        return
      }
      await mutate()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Scissors className="h-4 w-4 text-ink-2" />
          Servicios
        </div>
        {!editing && catalog.length > 0 && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar servicios
          </button>
        )}
      </div>

      {catalog.length === 0 ? (
        <p className="text-xs text-ink-3">
          Aún no hay servicios en el catálogo. Créalos en{' '}
          <Link
            href="/dashboard/ajustes"
            className="font-medium text-brand hover:text-brand-strong"
          >
            Ajustes › Negocio
          </Link>{' '}
          y vuelve para asignarlos.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-ink-3">Cargando servicios…</p>
      ) : editing ? (
        <div className="space-y-2">
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
            {catalog.map((s) => (
              <label
                key={s.name}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-overlay/50"
              >
                <input
                  type="checkbox"
                  checked={draft.has(s.name)}
                  onChange={() => toggle(s.name)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">
                  {fmtDur(s.duration)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-ink-2">
                  {fmtPrice(s.price)}
                </span>
              </label>
            ))}
          </div>
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-overlay hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-espresso)] px-4 py-2 text-sm font-semibold text-[var(--color-cream-high)] transition-colors hover:bg-[var(--color-espresso-2)] disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      ) : doesAll ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <Check className="h-3.5 w-3.5 text-success" />
          Hace todos los servicios del catálogo.
        </p>
      ) : (
        <ul className="space-y-1 rounded-lg border border-line p-2">
          {catalog
            .filter((s) => assigned.includes(s.name))
            .map((s) => (
              <li
                key={s.name}
                className="flex items-center gap-3 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">
                  {fmtDur(s.duration)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums text-ink-2">
                  {fmtPrice(s.price)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
