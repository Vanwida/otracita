'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { Bot, Send, AlertCircle, Loader2 } from 'lucide-react'

// -----------------------------------------------------------------------------
// BotRequestForm — formulario self-service para solicitar la activación del
// bot WhatsApp (#53). Render dentro de /dashboard/marketing/whatsapp cuando
// el barbero NO tiene `whatsappPhoneNumberId` ni `whatsappBotRequest`.
//
// Inputs:
//   · phoneRequested      — E.164, validación client-side con libphonenumber
//   · businessLegalName   — CIF/razón social
//   · fbBusinessId        — opcional, ayuda a Alex en Meta Business Manager
//
// Mobile-first, cabe en viewport sin scroll vertical (Hard rule del proyecto).
// Errores inline en el propio campo, no modal. Botón submit con loader.
//
// POST a /api/whatsapp/bot-request. Tras éxito, `router.refresh()` para que
// el server component vuelva a renderizar el banner "En cola".
// -----------------------------------------------------------------------------

interface Props {
  /** Cuando el barbero quiere EDITAR una solicitud ya enviada, pasamos los
   *  valores previos para prefill. */
  initial?: {
    phoneRequested?: string | null
    businessLegalName?: string | null
    fbBusinessId?: string | null
  }
}

export default function BotRequestForm({ initial }: Props) {
  const router = useRouter()
  const [phone, setPhone] = useState(initial?.phoneRequested ?? '')
  const [legalName, setLegalName] = useState(initial?.businessLegalName ?? '')
  const [fbId, setFbId] = useState(initial?.fbBusinessId ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Validación local (no bloquea submit — el server revalida).
  const phoneParsed = phone ? parsePhoneNumberFromString(phone, 'ES') : null
  const phoneInvalid = phone.length > 0 && (!phoneParsed || !phoneParsed.isValid())
  const legalInvalid = legalName.length > 0 && legalName.trim().length < 3

  const canSubmit =
    !submitting &&
    phone.trim().length > 0 &&
    !phoneInvalid &&
    legalName.trim().length >= 3

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setServerError(null)

    try {
      const res = await fetch('/api/whatsapp/bot-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneRequested: phone.trim(),
          businessLegalName: legalName.trim(),
          fbBusinessId: fbId.trim(),
        }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setServerError(data.error ?? 'No se pudo enviar la solicitud.')
        setSubmitting(false)
        return
      }

      router.refresh()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Error de red.')
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-surface shadow-[0_1px_0_0_var(--color-line)]">
      <header className="flex items-start gap-3 px-[var(--space-card)] pt-[var(--space-card)] md:px-6 md:pt-6">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-softer text-brand-strong"
        >
          <Bot className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h2
            className="font-semibold leading-tight text-ink"
            style={{ fontSize: 'var(--text-section-title)' }}
          >
            {initial ? 'Editar solicitud' : 'Solicitar activación del bot'}
          </h2>
          <p className="mt-1 text-ink-2" style={{ fontSize: 'var(--text-meta)' }}>
            Rellena estos datos y activamos tu bot en Meta en menos de 24h. Te avisamos
            por email cuando esté listo.
          </p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="px-[var(--space-card)] pb-[var(--space-card)] pt-4 md:px-6 md:pb-6 md:pt-5"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Número WhatsApp */}
          <Field
            label="Número de WhatsApp Business"
            hint={
              phoneParsed && phoneParsed.isValid()
                ? `Detectado: ${phoneParsed.formatInternational()}`
                : 'Formato internacional con prefijo (ej. +34 644 28 86 63).'
            }
            error={phoneInvalid ? 'Número inválido. Usa formato internacional.' : null}
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 644 28 86 63"
              className={`w-full bg-surface border rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors ${
                phoneInvalid ? 'border-danger' : 'border-line'
              }`}
              required
            />
          </Field>

          {/* Nombre legal */}
          <Field
            label="Nombre legal del negocio"
            hint="Razón social o CIF/NIF. Lo necesita Meta para verificar."
            error={legalInvalid ? 'Mínimo 3 caracteres.' : null}
          >
            <input
              type="text"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Barbería Reni S.L. — B12345678"
              maxLength={200}
              className={`w-full bg-surface border rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors ${
                legalInvalid ? 'border-danger' : 'border-line'
              }`}
              required
            />
          </Field>

          {/* Facebook Business ID — opcional */}
          <Field
            label="Facebook Business ID"
            hint="Opcional — acelera el alta si ya tienes Meta Business Manager."
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={fbId}
              onChange={(e) => setFbId(e.target.value.replace(/\D/g, ''))}
              placeholder="123456789012345"
              maxLength={30}
              className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
            />
          </Field>
        </div>

        <div className="mt-5 rounded-lg border border-line bg-overlay px-4 py-3 text-xs text-ink-2">
          <strong className="text-ink">Aviso:</strong> necesitarás verificar el número en
          Meta Business Manager. Te guiamos paso a paso por email en cuanto recibamos
          tu solicitud.
        </div>

        {serverError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{serverError}</span>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary inline-flex items-center gap-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {initial ? 'Actualizar solicitud' : 'Solicitar activación'}
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  )
}

// ─── sub-component ──────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink-2 mb-1.5">{label}</label>
      {children}
      {error ? (
        <p className="text-xs text-danger mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3 mt-1.5">{hint}</p>
      ) : null}
    </div>
  )
}
