"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronRight, ChevronLeft, Link2, Calendar, Scissors, ClipboardCheck, Search, Plus, X, User } from "lucide-react"

interface Service {
  name: string
  duration: string
  price: string
}

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Step 1: Booksy or Manual
  const [hasBooksy, setHasBooksy] = useState<boolean | null>(null)
  const [booksyUrl, setBooksyUrl] = useState("")
  const [scraping, setScraping] = useState(false)
  const [scraped, setScraped] = useState(false)

  // Business Info (filled by scrape or manually)
  const [businessName, setBusinessName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [phone, setPhone] = useState("")
  const [city, setCity] = useState("Barcelona")
  const [address, setAddress] = useState("")

  // Services
  const [services, setServices] = useState<Service[]>([{ name: "", duration: "30", price: "" }])

  // Barbers
  const [barbers, setBarbers] = useState<string[]>([])
  const [newBarber, setNewBarber] = useState("")

  // Hours
  const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
  const DAY_LABELS: Record<string, string> = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" }
  const [hours, setHours] = useState<Record<string, string>>({
    lunes: "10:00-20:00", martes: "10:00-20:00", miercoles: "10:00-20:00",
    jueves: "10:00-20:00", viernes: "10:00-20:00", sabado: "10:00-14:00", domingo: "Cerrado"
  })

  // Calendar
  const [googleCalendarId, setGoogleCalendarId] = useState("")

  // Scraper
  const handleScrapeBooksy = async () => {
    if (!booksyUrl || !booksyUrl.includes('booksy.com')) return
    setScraping(true)
    setError("")
    try {
      const res = await fetch('/api/scrape-booksy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: booksyUrl }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      if (data.businessName) setBusinessName(data.businessName)
      if (data.address) setAddress(data.address)
      if (data.phone) setPhone(data.phone)

      if (data.services?.length > 0) {
        setServices(data.services.map((s: { name: string; duration: number; price: number }) => ({
          name: s.name,
          duration: String(s.duration || 30),
          price: String(s.price || ''),
        })))
      }

      if (data.barbers?.length > 0) {
        setBarbers(data.barbers.map((b: { name: string }) => b.name))
      }

      if (data.hours) {
        setHours(prev => ({ ...prev, ...data.hours }))
      }

      setScraped(true)
      setStep(2) // Auto-advance to review
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al importar desde Booksy')
    } finally {
      setScraping(false)
    }
  }

  // Service helpers
  const addService = () => setServices([...services, { name: "", duration: "30", price: "" }])
  const removeService = (index: number) => {
    if (services.length > 1) setServices(services.filter((_, i) => i !== index))
  }
  const updateService = (index: number, field: keyof Service, value: string) => {
    const updated = [...services]
    updated[index] = { ...updated[index], [field]: value }
    setServices(updated)
  }

  // Submit
  const handleSubmit = async () => {
    setSaving(true)
    setError("")
    try {
      const formData = new FormData()
      formData.set("businessName", businessName)
      formData.set("ownerName", ownerName)
      formData.set("phone", phone)
      formData.set("city", city)
      formData.set("address", address)
      formData.set("booksyUrl", booksyUrl)
      formData.set("googleCalendarId", googleCalendarId)
      formData.set("services", JSON.stringify(services.filter(s => s.name.trim())))
      formData.set("barbers", JSON.stringify(barbers.filter(b => b.trim())))
      formData.set("hours", JSON.stringify(hours))

      const res = await fetch("/api/setup", { method: "POST", body: formData })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al guardar")
      }
      router.push("/dashboard?setup=complete")
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    { num: 1, label: "Importar", icon: Link2 },
    { num: 2, label: "Tu Negocio", icon: Scissors },
    { num: 3, label: "Calendario", icon: Calendar },
    { num: 4, label: "Confirmar", icon: ClipboardCheck },
  ]

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Configura tu Chatbot</h1>
        <p className="text-neutral-500">Completa estos pasos para que tu asistente IA esté listo.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto">
        {steps.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.num} className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => s.num < step && setStep(s.num)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  step === s.num
                    ? "bg-emerald-500 text-black"
                    : step > s.num
                      ? "bg-[#1a1a1a] text-emerald-400 cursor-pointer"
                      : "bg-[#141414] text-neutral-500 border border-[#262626]"
                }`}
              >
                {step > s.num ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <span className="hidden sm:inline text-xs">{s.label}</span>
              </button>
              {s.num < 4 && <ChevronRight className="h-4 w-4 text-neutral-700" />}
            </div>
          )
        })}
      </div>

      <div className="bg-[#141414] border border-[#262626] rounded-xl p-4 md:p-8">

        {/* ─── STEP 1: Import from Booksy or Manual ─── */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white">¿Tienes Booksy?</h2>
            <p className="text-sm text-neutral-500">
              Si usas Booksy, podemos importar tus servicios, precios y datos automáticamente. Si no, los añades tú.
            </p>

            {hasBooksy === null && (
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button
                  onClick={() => setHasBooksy(true)}
                  className="flex flex-col items-center gap-3 rounded-xl border border-[#262626] bg-[#0f0f0f] p-6 text-center transition-colors hover:border-[#333] hover:bg-[#1a1a1a]"
                >
                  <Search className="h-8 w-8 text-neutral-400" />
                  <span className="text-sm font-bold text-white">Sí, tengo Booksy</span>
                  <span className="text-xs text-neutral-500">Importamos todo automáticamente</span>
                </button>
                <button
                  onClick={() => { setHasBooksy(false); setStep(2) }}
                  className="flex flex-col items-center gap-3 rounded-xl border border-[#262626] bg-[#0f0f0f] p-6 text-center transition-colors hover:border-[#333] hover:bg-[#1a1a1a]"
                >
                  <User className="h-8 w-8 text-neutral-400" />
                  <span className="text-sm font-bold text-white">No, configuro manual</span>
                  <span className="text-xs text-neutral-500">Añado mis datos paso a paso</span>
                </button>
              </div>
            )}

            {hasBooksy === true && (
              <div className="space-y-4 mt-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-neutral-400">URL de tu perfil de Booksy</label>
                  <input
                    type="text"
                    value={booksyUrl}
                    onChange={(e) => setBooksyUrl(e.target.value)}
                    placeholder="https://booksy.com/es-es/..."
                    className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                  />
                  <p className="text-xs text-neutral-600">Copia la URL de tu perfil público de Booksy</p>
                </div>

                {booksyUrl.includes('booksy.com') && (
                  <button
                    type="button"
                    onClick={handleScrapeBooksy}
                    disabled={scraping}
                    className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-4 text-sm font-bold text-black transition-colors active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {scraping ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Importando tu negocio...
                      </>
                    ) : (
                      <>
                        <Search className="h-5 w-5" />
                        Importar desde Booksy
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => { setHasBooksy(false); setStep(2) }}
                  className="w-full text-center text-xs text-neutral-600 hover:text-neutral-400 transition-colors mt-2"
                >
                  O configura manualmente →
                </button>

                {error && (
                  <div className="bg-[#141414] border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: Business Info + Services (review or manual) ─── */}
        {step === 2 && (
          <div className="space-y-8">
            {scraped && (
              <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
                <p className="text-sm text-emerald-400">
                  ✅ Datos importados desde Booksy. Revisa y edita lo que necesites.
                </p>
              </div>
            )}

            {/* Business Info */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Datos del Negocio</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField label="Nombre del Negocio" value={businessName} onChange={setBusinessName} placeholder="Ej. Barbería Central" required />
                <InputField label="Tu Nombre" value={ownerName} onChange={setOwnerName} placeholder="Ej. Carlos García" required />
                <InputField label="Teléfono / WhatsApp" value={phone} onChange={setPhone} placeholder="+34 600 123 456" required />
                <InputField label="Ciudad" value={city} onChange={setCity} placeholder="Barcelona" />
              </div>
              <InputField label="Dirección" value={address} onChange={setAddress} placeholder="Calle Gran Vía 123, Barcelona" />
            </div>

            {/* Divider */}
            <div className="border-t border-[#1f1f1f]" />

            {/* Services */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Servicios</h2>
                <span className="text-xs text-neutral-600">{services.filter(s => s.name.trim()).length} servicios</span>
              </div>

              <div className="space-y-3">
                {services.map((service, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={service.name}
                      onChange={(e) => updateService(i, "name", e.target.value)}
                      placeholder="Nombre del servicio"
                      className="flex-1 bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                    />
                    <div className="flex gap-2 sm:contents">
                      <input
                        type="number"
                        value={service.duration}
                        onChange={(e) => updateService(i, "duration", e.target.value)}
                        placeholder="Min"
                        className="w-20 bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors text-center"
                      />
                      <div className="relative w-24">
                        <input
                          type="number"
                          value={service.price}
                          onChange={(e) => updateService(i, "price", e.target.value)}
                          placeholder="€"
                          className="w-full bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors text-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeService(i)}
                        disabled={services.length <= 1}
                        className="shrink-0 rounded-lg p-3 text-neutral-600 hover:text-red-400 hover:bg-[#1a1a1a] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addService}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-[#333] px-4 py-3 text-sm text-neutral-500 hover:border-[#444] hover:text-neutral-300 transition-colors w-full"
              >
                <Plus className="h-4 w-4" />
                Añadir servicio
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-[#1f1f1f]" />

            {/* Barbers */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Equipo / Barberos</h2>
              <p className="text-xs text-neutral-600">Añade los profesionales de tu negocio. El chatbot preguntará con quién quiere reservar.</p>

              <div className="flex flex-wrap gap-2">
                {barbers.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-full bg-[#1a1a1a] border border-[#262626] px-4 py-2">
                    <span className="text-sm text-neutral-300">{b}</span>
                    <button onClick={() => setBarbers(barbers.filter((_, j) => j !== i))} className="text-neutral-600 hover:text-red-400 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBarber}
                  onChange={(e) => setNewBarber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newBarber.trim()) {
                      e.preventDefault()
                      setBarbers([...barbers, newBarber.trim()])
                      setNewBarber("")
                    }
                  }}
                  placeholder="Nombre del barbero"
                  className="flex-1 bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBarber.trim()) {
                      setBarbers([...barbers, newBarber.trim()])
                      setNewBarber("")
                    }
                  }}
                  className="rounded-lg bg-[#1a1a1a] border border-[#262626] px-4 py-3 text-sm text-neutral-300 hover:bg-[#222] hover:border-[#333] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#1f1f1f]" />

            {/* Hours */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Horario</h2>
              <div className="space-y-2">
                {DAYS.map((day) => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="text-sm text-neutral-400 w-24 shrink-0">{DAY_LABELS[day]}</span>
                    <select
                      value={hours[day] === 'Cerrado' ? 'closed' : 'open'}
                      onChange={(e) => {
                        if (e.target.value === 'closed') {
                          setHours({ ...hours, [day]: 'Cerrado' })
                        } else {
                          setHours({ ...hours, [day]: '10:00-20:00' })
                        }
                      }}
                      className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-2 text-sm text-white outline-none w-24 focus:border-emerald-500 transition-colors"
                    >
                      <option value="open">Abierto</option>
                      <option value="closed">Cerrado</option>
                    </select>
                    {hours[day] !== 'Cerrado' && (
                      <input
                        type="text"
                        value={hours[day]}
                        onChange={(e) => setHours({ ...hours, [day]: e.target.value })}
                        placeholder="10:00-20:00"
                        className="flex-1 bg-[#0f0f0f] border border-[#262626] rounded-lg p-2 text-sm text-white focus:border-emerald-500 outline-none transition-colors text-center"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Calendar ─── */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white">Conecta tu Calendario</h2>
            <p className="text-sm text-neutral-500">
              El chatbot necesita ver tu calendario para mostrar huecos disponibles y crear reservas automáticamente.
            </p>

            <InputField
              label="Google Calendar ID"
              value={googleCalendarId}
              onChange={setGoogleCalendarId}
              placeholder="abc123@group.calendar.google.com"
            />

            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-sm text-neutral-300 font-medium mb-2">¿Necesitas ayuda?</p>
              <p className="text-sm text-neutral-400">
                Nuestro equipo te ayuda a conectar tu Booksy con Google Calendar gratis.{" "}
                <a
                  href="https://wa.me/34644288663?text=Hola!%20Necesito%20ayuda%20para%20conectar%20mi%20calendario"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-500 underline font-medium hover:text-emerald-400 transition-colors"
                >
                  Escríbenos por WhatsApp
                </a>
              </p>
            </div>

            <div className="bg-[#141414] border border-[#262626] rounded-xl p-4">
              <p className="text-xs text-neutral-500">
                💡 Si usas Booksy, activa "Reserve with Google" en Booksy → Configuración → Reservas Online.
                Esto sincroniza automáticamente tu calendario de Booksy con Google Calendar.
              </p>
            </div>
          </div>
        )}

        {/* ─── STEP 4: Confirm ─── */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-white">Todo listo — revisa y confirma</h2>

            <div className="space-y-4">
              <ReviewSection title="Tu Negocio">
                <ReviewItem label="Nombre" value={businessName} />
                <ReviewItem label="Dueño" value={ownerName} />
                <ReviewItem label="Teléfono" value={phone} />
                <ReviewItem label="Dirección" value={address || "—"} />
              </ReviewSection>

              <ReviewSection title="Servicios">
                {services.filter(s => s.name.trim()).length > 0 ? (
                  services.filter(s => s.name.trim()).map((s, i) => (
                    <ReviewItem key={i} label={s.name} value={`${s.duration}min · ${s.price}€`} />
                  ))
                ) : (
                  <p className="text-neutral-600 text-sm italic">Sin servicios</p>
                )}
              </ReviewSection>

              {barbers.length > 0 && (
                <ReviewSection title="Equipo">
                  {barbers.map((b, i) => (
                    <ReviewItem key={i} label={b} value="Activo" />
                  ))}
                </ReviewSection>
              )}

              <ReviewSection title="Horario">
                {DAYS.map(day => (
                  <ReviewItem key={day} label={DAY_LABELS[day]} value={hours[day]} />
                ))}
              </ReviewSection>

              <ReviewSection title="Calendario">
                <ReviewItem label="Google Calendar" value={googleCalendarId || "Pendiente de conectar"} />
                {booksyUrl && <ReviewItem label="Booksy" value="Conectado" />}
              </ReviewSection>
            </div>

            {error && (
              <div className="bg-[#141414] border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-[#262626]">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 rounded-lg border border-[#262626] px-5 py-3 text-sm font-medium text-neutral-400 hover:bg-[#1a1a1a] hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </button>
          ) : (
            <div />
          )}

          {step >= 2 && step < 4 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && (!businessName.trim() || !ownerName.trim() || !phone.trim())}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-bold text-black transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {step === 4 && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 px-8 py-3 text-sm font-bold text-black transition-colors active:scale-95 disabled:opacity-50"
            >
              {saving ? "Activando..." : "Confirmar y Activar"}
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, required = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-neutral-400">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
      />
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0f0f0f] border border-[#262626] rounded-xl p-5">
      <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm gap-4">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-white font-medium text-right truncate">{value || "—"}</span>
    </div>
  )
}
