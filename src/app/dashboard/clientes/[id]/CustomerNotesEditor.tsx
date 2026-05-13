'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, Loader2, StickyNote } from 'lucide-react'

// -----------------------------------------------------------------------------
// Editor inline para notas privadas del barbero sobre un cliente.
//
// Estados:
//   - Vista (default): muestra notas existentes o placeholder.
//   - Editando: textarea + Guardar / Cancelar.
//
// Save vía PATCH /api/customers/[id]/notes. Multi-tenancy se valida
// server-side (solo el barbero owner del client puede editar).
//
// Privacidad: estas notas NUNCA se exponen al cliente vía PWA o WhatsApp,
// son solo para el barbero. Útil para "alérgico a X", "no le gusta el
// degradado", "siempre llega tarde 5min", etc.
// -----------------------------------------------------------------------------

const MAX_LENGTH = 2000

interface Props {
  customerId: string
  initialNotes: string
}

export default function CustomerNotesEditor({ customerId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes)
  const [draft, setDraft] = useState(initialNotes)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const onSave = () => {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fetch(`/api/customers/${customerId}/notes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: draft }),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo guardar')
          return
        }
        setNotes(draft)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch {
        setError('Error de red')
      }
    })
  }

  const onCancel = () => {
    setDraft(notes)
    setEditing(false)
    setError(null)
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-ink-3" />
          <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
            Notas privadas
          </h2>
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" /> Guardado
            </span>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-strong transition-colors"
          >
            <Pencil className="h-3 w-3" />
            {notes.length > 0 ? 'Editar' : 'Añadir notas'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={MAX_LENGTH}
            placeholder="Apunta cosas útiles: alergias, preferencias de corte, observaciones..."
            className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink resize-none focus:border-brand outline-none transition-colors"
          />
          <div className="flex items-center justify-between gap-3 mt-2">
            <p className="text-[11px] text-ink-3">{draft.length}/{MAX_LENGTH}</p>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-danger">{error}</span>}
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className="text-xs text-ink-2 hover:text-ink px-3 py-1.5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending || draft === notes}
                className="btn-primary btn-sm"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div>
          {notes.length > 0 ? (
            <p className="text-sm text-ink-2 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
              {notes}
            </p>
          ) : (
            <p className="text-sm text-ink-3 italic">
              Sin notas. Útil para alergias, preferencias o cosas a recordar de este cliente.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
