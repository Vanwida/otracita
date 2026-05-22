'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, ArrowUpDown, Download } from 'lucide-react'

// -----------------------------------------------------------------------------
// SearchAndSort — controles client-side para la página de clientes:
//   · Search debounceado (400ms) que actualiza URL ?q= sin perder otros
//     params (rep, sort).
//   · Selector de orden ?sort= con presets validados server-side.
//   · Botón export CSV que descarga /api/customers/export.
//
// El servidor renderiza la lista a partir de los URL params, así que
// estos controles son solo "navegadores" — la UI re-renderiza tras cada
// router.replace.
// -----------------------------------------------------------------------------

const SORT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'recent', label: 'Última visita' },
  { key: 'spent', label: 'Más gastado' },
  { key: 'visits', label: 'Más visitas' },
  { key: 'rating', label: 'Mejor nota' },
  { key: 'name', label: 'Nombre A-Z' },
]

export default function SearchAndSort() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')

  const currentSort = searchParams.get('sort') ?? 'recent'
  const currentRep = searchParams.get('rep') ?? null
  // Preservamos también `status` (filter pill activo) y `source` (chips
  // multi-select por canal) — sin esto, escribir en el buscador o cambiar
  // el orden tira los chips a la basura.
  const currentStatus = searchParams.get('status') ?? null
  const currentSource = searchParams.get('source') ?? null

  // Debounce de la búsqueda — evita un router.replace por tecla. 400ms
  // es el sweet spot que recomienda HIG; <300ms se sienten "saltones",
  // >500ms se siente lag.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      if (currentRep) params.set('rep', currentRep)
      if (currentStatus) params.set('status', currentStatus)
      if (currentSource) params.set('source', currentSource)
      if (currentSort !== 'recent') params.set('sort', currentSort)
      const trimmed = query.trim()
      if (trimmed.length > 0) params.set('q', trimmed)
      const qs = params.toString()
      const target = qs ? `/dashboard/clientes?${qs}` : '/dashboard/clientes'
      // Solo navegamos si cambió de verdad (evita loop infinito al montar).
      const currentQ = searchParams.get('q') ?? ''
      if (trimmed !== currentQ) {
        startTransition(() => router.replace(target))
      }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const setSort = (next: string) => {
    const params = new URLSearchParams()
    if (currentRep) params.set('rep', currentRep)
    if (currentStatus) params.set('status', currentStatus)
    if (currentSource) params.set('source', currentSource)
    if (next !== 'recent') params.set('sort', next)
    const trimmed = query.trim()
    if (trimmed.length > 0) params.set('q', trimmed)
    const qs = params.toString()
    const target = qs ? `/dashboard/clientes?${qs}` : '/dashboard/clientes'
    startTransition(() => router.replace(target))
  }

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-3 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="w-full bg-surface border border-line rounded-lg pl-9 pr-9 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-3 hover:text-ink rounded"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 bg-surface border border-line rounded-lg px-2 py-1">
        <ArrowUpDown className="h-3.5 w-3.5 text-ink-3 shrink-0" />
        <select
          value={currentSort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-transparent text-xs font-medium text-ink-2 outline-none cursor-pointer pr-1"
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <a
        href="/api/customers/export"
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-surface border border-line hover:border-line-strong text-ink-2 hover:text-ink text-xs font-medium px-3 py-2 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar CSV
      </a>

      {pending && (
        <span className="text-[11px] text-ink-3">Buscando…</span>
      )}
    </div>
  )
}
