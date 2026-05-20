'use client'

import { useState, useTransition } from 'react'
import { Pencil, Check, Loader2, Mail } from 'lucide-react'
import { FEEDBACK_MS } from '@/lib/ui-timings'

// -----------------------------------------------------------------------------
// Editor inline del email del cliente. Espejo de CustomerNotesEditor pero
// para un único campo de una línea.
//
// Estados:
//   - Vista (default): muestra el email (mailto) o placeholder.
//   - Editando: input + Guardar / Cancelar. Vacío → borra (NULL).
//
// Save vía PATCH /api/customers/[id]/email. Multi-tenancy + validación de
// forma se hacen server-side; aquí solo damos feedback rápido.
//
// El email lo puede haber rellenado el cliente desde el form público o la
// sesión de la app; aquí el barbero lo corrige/añade/borra. Lo que escriba
// el barbero manda sobre cualquier autocaptura posterior.
// -----------------------------------------------------------------------------

const MAX_LENGTH = 254
// Misma forma laxa que isValidEmail en el server — feedback inmediato sin
// pedir round-trip para el caso obvio de "falta @".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Props {
  customerId: string
  initialEmail: string
}

export default function CustomerEmailEditor({ customerId, initialEmail }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [draft, setDraft] = useState(initialEmail)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmed = draft.trim()
  // Vacío es válido (borra el email). Con contenido, debe tener forma.
  const localInvalid = trimmed.length > 0 && (trimmed.length > MAX_LENGTH || !EMAIL_RE.test(trimmed))

  const onSave = () => {
    setError(null)
    if (localInvalid) {
      setError('Email inválido')
      return
    }
    startTransition(async () => {
      try {
        const r = await fetch(`/api/customers/${customerId}/email`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: draft }),
        })
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string }
          setError(d?.error ?? 'No se pudo guardar')
          return
        }
        const next = trimmed.toLowerCase()
        setEmail(next)
        setDraft(next)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), FEEDBACK_MS.copied)
      } catch {
        setError('Error de red')
      }
    })
  }

  const onCancel = () => {
    setDraft(email)
    setEditing(false)
    setError(null)
  }

  return (
    <section className="bg-surface border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-ink-3" />
          <h2 className="text-sm font-semibold text-ink uppercase tracking-widest">
            Email
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
            {email.length > 0 ? 'Editar' : 'Añadir email'}
          </button>
        )}
      </div>

      {editing ? (
        <>
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_LENGTH}
            autoComplete="email"
            placeholder="cliente@ejemplo.com"
            className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink focus:border-brand outline-none transition-colors"
          />
          <div className="flex items-center justify-between gap-3 mt-2">
            <p className="text-[11px] text-ink-3">
              Déjalo vacío para quitarlo.
            </p>
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
                disabled={pending || draft === email || localInvalid}
                className="btn-primary btn-sm"
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div>
          {email.length > 0 ? (
            <a
              href={`mailto:${email}`}
              className="text-sm text-ink-2 hover:text-brand transition-colors break-all"
            >
              {email}
            </a>
          ) : (
            <p className="text-sm text-ink-3 italic">
              Sin email. Útil para enviarle facturas o recordatorios por correo.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
