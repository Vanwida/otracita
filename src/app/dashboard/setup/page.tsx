"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Check, ChevronRight, ChevronLeft, Scissors, ClipboardCheck, Search, Plus, X,
  Store, Users, Clock, Palette, Receipt, Sun, Moon, Shield, Sparkles, Globe, Loader2,
} from "lucide-react"

// -----------------------------------------------------------------------------
// Setup Wizard — onboarding de un barbero en 6 pasos + revisión.
//
//   1. Tu negocio          (nombre, dueño, phone, dirección) + Booksy opcional
//   2. Equipo y servicios  (barberos + servicios)
//   3. Horario             (horas de apertura por día)
//   4. Tu app pública      (slug + tema + color + descripción corta)
//   5. Facturación         (opcional, con VeriFactu explicado)
//   6. Revisión + activar
//
// Persiste via POST /api/setup. Redirect final a /dashboard?welcome=1 con
// slug + URL pública de la barbería para que la copie/comparta al instante.
// -----------------------------------------------------------------------------

interface Service {
  name: string
  duration: string
  price: string
}

const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
const DAY_LABELS: Record<string, string> = {
  lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves",
  viernes: "Viernes", sabado: "Sábado", domingo: "Domingo",
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // ── Step 1: Negocio + Booksy opcional ──
  const [businessName, setBusinessName] = useState("")
  const [ownerName, setOwnerName] = useState("")
  const [phone, setPhone] = useState("")
  const [city, setCity] = useState("Barcelona")
  const [address, setAddress] = useState("")
  const [booksyUrl, setBooksyUrl] = useState("")
  const [scraping, setScraping] = useState(false)
  const [scraped, setScraped] = useState(false)

  // ── Step 2: Equipo + Servicios ──
  const [services, setServices] = useState<Service[]>([{ name: "", duration: "30", price: "" }])
  const [barbers, setBarbers] = useState<string[]>([])
  const [newBarber, setNewBarber] = useState("")

  // ── Step 3: Horario ──
  const [hours, setHours] = useState<Record<string, string>>({
    lunes: "10:00-20:00", martes: "10:00-20:00", miercoles: "10:00-20:00",
    jueves: "10:00-20:00", viernes: "10:00-20:00", sabado: "10:00-14:00", domingo: "Cerrado",
  })

  // ── Step 4: App pública ──
  const [publicSlug, setPublicSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false) // si usuario tocó, no re-generamos
  const [brandTheme, setBrandTheme] = useState<"light" | "dark">("light")
  const [brandColor, setBrandColor] = useState("#C9653C")
  const [publicDescription, setPublicDescription] = useState("")

  // Auto-generate slug from business name hasta que el usuario lo edite
  useEffect(() => {
    if (!slugEdited && businessName) setPublicSlug(slugify(businessName))
  }, [businessName, slugEdited])

  // ── Step 5: Facturación (opcional) ──
  const [invoicingEnabled, setInvoicingEnabled] = useState(false)
  const [fiscalName, setFiscalName] = useState("")
  const [fiscalNif, setFiscalNif] = useState("")
  const [fiscalAddress, setFiscalAddress] = useState("")
  const [fiscalCity, setFiscalCity] = useState("")
  const [fiscalPostalCode, setFiscalPostalCode] = useState("")
  const [ivaRate, setIvaRate] = useState(21)
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState("")

  // ── Validación por paso ──
  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        return businessName.trim() && ownerName.trim() && phone.trim()
      case 2:
        return services.filter((s) => s.name.trim()).length > 0 // al menos 1 servicio
      case 3:
        return true
      case 4:
        return publicSlug.length >= 3 && /^[a-z0-9-]+$/.test(publicSlug)
      case 5:
        // Si invoicing on, los datos fiscales son obligatorios
        if (invoicingEnabled) {
          return (
            fiscalName.trim() && fiscalNif.trim() && fiscalAddress.trim() &&
            fiscalCity.trim() && fiscalPostalCode.trim()
          )
        }
        return true
      default:
        return true
    }
  }, [
    step, businessName, ownerName, phone, services, publicSlug, invoicingEnabled,
    fiscalName, fiscalNif, fiscalAddress, fiscalCity, fiscalPostalCode,
  ])

  // ── Scraper Booksy (opcional, dentro de paso 1) ──
  const handleScrapeBooksy = async () => {
    if (!booksyUrl || !booksyUrl.includes("booksy.com")) return
    setScraping(true)
    setError("")
    try {
      const res = await fetch("/api/scrape-booksy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: booksyUrl }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.businessName) setBusinessName(data.businessName)
      if (data.address) setAddress(data.address)
      if (data.phone) setPhone(data.phone)
      if (data.services?.length > 0) {
        setServices(data.services.map((s: { name: string; duration: number; price: number }) => ({
          name: s.name, duration: String(s.duration || 30), price: String(s.price || ""),
        })))
      }
      if (data.barbers?.length > 0) {
        setBarbers(data.barbers.map((b: { name: string }) => b.name))
      }
      if (data.hours) setHours((prev) => ({ ...prev, ...data.hours }))
      setScraped(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar desde Booksy")
    } finally {
      setScraping(false)
    }
  }

  // ── Service helpers ──
  const addService = () => setServices([...services, { name: "", duration: "30", price: "" }])
  const removeService = (index: number) => {
    if (services.length > 1) setServices(services.filter((_, i) => i !== index))
  }
  const updateService = (index: number, field: keyof Service, value: string) => {
    const updated = [...services]
    updated[index] = { ...updated[index], [field]: value }
    setServices(updated)
  }

  // ── Submit ──
  const handleSubmit = async () => {
    setSaving(true)
    setError("")
    try {
      const fd = new FormData()
      fd.set("businessName", businessName)
      fd.set("ownerName", ownerName)
      fd.set("phone", phone)
      fd.set("city", city)
      fd.set("address", address)
      fd.set("booksyUrl", booksyUrl)
      fd.set("services", JSON.stringify(services.filter((s) => s.name.trim())))
      fd.set("barbers", JSON.stringify(barbers.filter((b) => b.trim())))
      fd.set("hours", JSON.stringify(hours))
      fd.set("publicSlug", publicSlug)
      fd.set("brandTheme", brandTheme)
      fd.set("brandColor", brandColor)
      fd.set("publicDescription", publicDescription)
      if (invoicingEnabled) fd.set("invoicingEnabled", "on")
      fd.set("fiscalName", fiscalName)
      fd.set("fiscalNif", fiscalNif)
      fd.set("fiscalAddress", fiscalAddress)
      fd.set("fiscalCity", fiscalCity)
      fd.set("fiscalPostalCode", fiscalPostalCode)
      fd.set("ivaRate", String(ivaRate))
      fd.set("invoiceNumberPrefix", invoiceNumberPrefix)

      const res = await fetch("/api/setup", { method: "POST", body: fd })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al guardar")
      }
      router.push("/dashboard?welcome=1")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    { num: 1, label: "Negocio", icon: Store },
    { num: 2, label: "Equipo", icon: Users },
    { num: 3, label: "Horario", icon: Clock },
    { num: 4, label: "Tu app", icon: Palette },
    { num: 5, label: "Facturación", icon: Receipt },
    { num: 6, label: "Revisar", icon: ClipboardCheck },
  ]

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Hero */}
      <div className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-ink mb-2">
          Configura tu cuenta
        </h1>
        <p className="text-ink-2">
          5 minutos y tendrás tu bot de WhatsApp, tu app para clientes y tu
          facturación legal funcionando.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {steps.map((s, i) => {
          const Icon = s.icon
          const isCurrent = step === s.num
          const isPast = step > s.num
          return (
            <div key={s.num} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => isPast && setStep(s.num)}
                disabled={!isPast && !isCurrent}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isCurrent
                    ? "bg-brand text-brand-ink"
                    : isPast
                    ? "bg-brand-softer text-brand-strong cursor-pointer hover:bg-brand-softer/70"
                    : "bg-surface border border-line text-ink-3"
                }`}
              >
                {isPast ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.num}</span>
              </button>
              {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-ink-3" />}
            </div>
          )
        })}
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5 md:p-8">
        {/* ═══ STEP 1 — Negocio + Booksy opcional ═══ */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-ink">Tu negocio</h2>
              <p className="text-sm text-ink-2 mt-1">
                Los datos básicos. Usaremos este número de teléfono como WhatsApp
                del bot y de tu dashboard.
              </p>
            </div>

            {/* Booksy shortcut — opcional, arriba del form */}
            <details className="group rounded-xl border border-dashed border-line bg-overlay/30">
              <summary className="flex items-center justify-between gap-2 cursor-pointer list-none p-4">
                <div className="flex items-center gap-2.5">
                  <Search className="h-4 w-4 text-brand" />
                  <span className="text-sm font-semibold text-ink">
                    ¿Vienes de Booksy?
                  </span>
                  <span className="text-xs text-ink-3">Importamos tus datos en segundos</span>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-90" />
              </summary>
              <div className="px-4 pb-4 space-y-3">
                <input
                  type="text"
                  value={booksyUrl}
                  onChange={(e) => setBooksyUrl(e.target.value)}
                  placeholder="https://booksy.com/es-es/..."
                  className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none"
                />
                <button
                  type="button"
                  onClick={handleScrapeBooksy}
                  disabled={scraping || !booksyUrl.includes("booksy.com")}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand hover:bg-brand-strong px-4 py-2.5 text-sm font-bold text-brand-ink transition-colors disabled:opacity-50"
                >
                  {scraping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {scraping ? "Importando…" : "Importar desde Booksy"}
                </button>
                {scraped && (
                  <p className="text-xs text-success">✅ Datos importados. Revisa abajo y ajusta lo que necesites.</p>
                )}
              </div>
            </details>

            {/* Form principal */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField label="Nombre del negocio" value={businessName} onChange={setBusinessName} placeholder="Barbería Central" required />
              <InputField label="Tu nombre" value={ownerName} onChange={setOwnerName} placeholder="Carlos García" required />
              <InputField label="Teléfono / WhatsApp" value={phone} onChange={setPhone} placeholder="+34 600 123 456" required />
              <InputField label="Ciudad" value={city} onChange={setCity} placeholder="Barcelona" />
            </div>
            <InputField label="Dirección" value={address} onChange={setAddress} placeholder="Calle Gran Vía 123, Barcelona" />
          </div>
        )}

        {/* ═══ STEP 2 — Equipo + Servicios ═══ */}
        {step === 2 && (
          <div className="space-y-7">
            <div>
              <h2 className="text-xl font-semibold text-ink">Equipo y servicios</h2>
              <p className="text-sm text-ink-2 mt-1">
                Añade quiénes trabajan contigo y qué ofrecéis. Luego podrás
                subirles foto desde el dashboard.
              </p>
            </div>

            {/* Equipo */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-ink-3">
                Equipo · {barbers.length}
              </h3>
              <div className="flex flex-wrap gap-2">
                {barbers.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-full bg-overlay border border-line px-3 py-1.5">
                    <span className="text-sm text-ink">{b}</span>
                    <button
                      type="button"
                      onClick={() => setBarbers(barbers.filter((_, j) => j !== i))}
                      className="text-ink-3 hover:text-danger"
                    >
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
                    if (e.key === "Enter" && newBarber.trim()) {
                      e.preventDefault()
                      setBarbers([...barbers, newBarber.trim()])
                      setNewBarber("")
                    }
                  }}
                  placeholder="Nombre del barbero / profesional"
                  className="flex-1 bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newBarber.trim()) {
                      setBarbers([...barbers, newBarber.trim()])
                      setNewBarber("")
                    }
                  }}
                  className="rounded-lg bg-overlay border border-line px-4 text-ink-2 hover:bg-canvas hover:border-line-strong"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-ink-3">Puedes dejarlo vacío si trabajas solo.</p>
            </div>

            {/* Servicios */}
            <div className="space-y-3 border-t border-line pt-6">
              <h3 className="text-sm font-bold uppercase tracking-widest text-ink-3">
                Servicios · {services.filter((s) => s.name.trim()).length}
              </h3>
              <div className="space-y-2">
                {services.map((service, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={service.name}
                      onChange={(e) => updateService(i, "name", e.target.value)}
                      placeholder="Nombre del servicio"
                      className="flex-1 bg-surface border border-line rounded-lg p-2.5 text-sm text-ink focus:border-brand outline-none"
                    />
                    <input
                      type="number"
                      value={service.duration}
                      onChange={(e) => updateService(i, "duration", e.target.value)}
                      placeholder="Min"
                      className="w-20 bg-surface border border-line rounded-lg p-2.5 text-sm text-ink focus:border-brand outline-none text-center"
                    />
                    <input
                      type="number"
                      value={service.price}
                      onChange={(e) => updateService(i, "price", e.target.value)}
                      placeholder="€"
                      className="w-20 bg-surface border border-line rounded-lg p-2.5 text-sm text-ink focus:border-brand outline-none text-center"
                    />
                    <button
                      type="button"
                      onClick={() => removeService(i)}
                      disabled={services.length <= 1}
                      className="rounded-lg p-2.5 text-ink-3 hover:text-danger hover:bg-danger/10 disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addService}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-4 py-2.5 text-sm text-ink-3 hover:border-brand hover:text-brand transition-colors w-full"
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir servicio
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 — Horario ═══ */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-ink">Horario semanal</h2>
              <p className="text-sm text-ink-2 mt-1">
                Horas de apertura por día. El bot solo ofrecerá huecos dentro
                de este rango. Lo podrás refinar después (parada comida, barberos
                con horario propio, etc).
              </p>
            </div>
            <div className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-sm text-ink-2 w-24 shrink-0">{DAY_LABELS[day]}</span>
                  <label className="inline-flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hours[day] !== "Cerrado"}
                      onChange={(e) =>
                        setHours({ ...hours, [day]: e.target.checked ? "10:00-20:00" : "Cerrado" })
                      }
                      className="h-4 w-4"
                    />
                    {hours[day] !== "Cerrado" ? "Abierto" : "Cerrado"}
                  </label>
                  {hours[day] !== "Cerrado" && (
                    <input
                      type="text"
                      value={hours[day]}
                      onChange={(e) => setHours({ ...hours, [day]: e.target.value })}
                      placeholder="10:00-20:00"
                      className="flex-1 bg-surface border border-line rounded-lg p-2 text-sm text-ink focus:border-brand outline-none text-center font-mono"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STEP 4 — Tu app pública ═══ */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
                <Globe className="h-5 w-5 text-brand" />
                Tu app pública
              </h2>
              <p className="text-sm text-ink-2 mt-1">
                Tu barbería tendrá su propia URL para que los clientes reserven
                sin app store. Puedes compartirla en Instagram, Google Maps,
                flyers, cualquier sitio.
              </p>
            </div>

            {/* Slug */}
            <div>
              <label className="text-sm font-medium text-ink-2">Tu URL pública</label>
              <div className="mt-1.5 flex items-center gap-0 bg-surface border border-line rounded-lg overflow-hidden focus-within:border-brand">
                <span className="px-3 py-2.5 text-sm text-ink-3 bg-overlay border-r border-line select-none">
                  otracita.es/b/
                </span>
                <input
                  type="text"
                  value={publicSlug}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setPublicSlug(slugify(e.target.value))
                  }}
                  placeholder="mi-barberia"
                  className="flex-1 p-2.5 text-sm text-ink font-mono outline-none bg-transparent"
                />
              </div>
              <p className="text-xs text-ink-3 mt-1.5">
                Letras, números y guiones. Mín. 3 caracteres. Si hay colisión,
                añadiremos un número.
              </p>
            </div>

            {/* Tema */}
            <div>
              <label className="text-sm font-medium text-ink-2 block mb-2">Tema</label>
              <div className="grid grid-cols-2 gap-2 max-w-sm">
                <ThemeOption
                  label="Claro"
                  icon={Sun}
                  active={brandTheme === "light"}
                  onClick={() => setBrandTheme("light")}
                  previewBg="#FAFAF7"
                  previewInk="#0F0F0F"
                />
                <ThemeOption
                  label="Oscuro"
                  icon={Moon}
                  active={brandTheme === "dark"}
                  onClick={() => setBrandTheme("dark")}
                  previewBg="#18181C"
                  previewInk="#FAFAFA"
                />
              </div>
            </div>

            {/* Color accent */}
            <div>
              <label className="text-sm font-medium text-ink-2 block mb-2">Color de acento</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-12 w-16 rounded-lg border border-line cursor-pointer shrink-0"
                />
                <span className="font-mono text-xs text-ink-3">{brandColor}</span>
                <p className="text-xs text-ink-3 flex-1">
                  Pinta botones, horarios seleccionados, badges. Elige un color
                  vibrante que represente tu marca.
                </p>
              </div>
            </div>

            {/* Descripción */}
            <div>
              <label className="text-sm font-medium text-ink-2 block mb-1.5">
                Descripción corta <span className="text-ink-3 font-normal">(opcional)</span>
              </label>
              <textarea
                value={publicDescription}
                onChange={(e) => setPublicDescription(e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Ej. Más de 20 años cortando en el barrio. Especializados en corte clásico + barba."
                className="w-full bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none resize-none"
              />
              <p className="text-xs text-ink-3 mt-1">{publicDescription.length}/300</p>
            </div>
          </div>
        )}

        {/* ═══ STEP 5 — Facturación ═══ */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
                <Receipt className="h-5 w-5 text-brand" />
                Facturación
              </h2>
              <p className="text-sm text-ink-2 mt-1">
                Emite tickets o facturas automáticas con cada cita confirmada —
                con numeración legal, cálculo de IVA y cumpliendo{" "}
                <strong>VeriFactu</strong> (obligatorio desde julio 2027).
                Opcional — puedes activarlo después.
              </p>
            </div>

            {/* Toggle activar */}
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-line bg-overlay/40 p-4 hover:border-brand/50 transition-colors has-[:checked]:border-brand has-[:checked]:bg-brand-softer">
              <input
                type="checkbox"
                checked={invoicingEnabled}
                onChange={(e) => setInvoicingEnabled(e.target.checked)}
                className="h-4 w-4 mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">
                  Activar emisión automática de tickets/facturas
                </p>
                <p className="text-xs text-ink-2 mt-0.5">
                  Cada reserva confirmada con precio generará su ticket. Incluye
                  QR VeriFactu y numeración correlativa obligatoria.
                </p>
              </div>
            </label>

            {invoicingEnabled && (
              <div className="space-y-4 pt-2">
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 text-xs text-ink-2 flex items-start gap-2">
                  <Shield className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <span>
                    Datos obligatorios según Real Decreto 1619/2012 art. 6 —
                    todos deben estar para emitir facturas legalmente.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Nombre fiscal / razón social" value={fiscalName} onChange={setFiscalName} placeholder="Alejandro Sole / Barbería Central SL" required />
                  <InputField label="NIF / CIF" value={fiscalNif} onChange={setFiscalNif} placeholder="12345678Z" required />
                </div>
                <InputField label="Dirección fiscal" value={fiscalAddress} onChange={setFiscalAddress} placeholder="Calle Gran Vía 123" required />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <InputField label="Código postal" value={fiscalPostalCode} onChange={setFiscalPostalCode} placeholder="08001" required />
                  <InputField label="Ciudad fiscal" value={fiscalCity} onChange={setFiscalCity} placeholder="Barcelona" required />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-ink-2">IVA aplicado</label>
                    <select
                      value={ivaRate}
                      onChange={(e) => setIvaRate(parseInt(e.target.value, 10))}
                      className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none"
                    >
                      <option value={21}>21% (general)</option>
                      <option value={10}>10%</option>
                      <option value={4}>4%</option>
                      <option value={0}>0% (exento)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <InputField
                    label="Prefijo número factura (opcional)"
                    value={invoiceNumberPrefix}
                    onChange={setInvoiceNumberPrefix}
                    placeholder="FAC-2026-"
                  />
                  <p className="text-xs text-ink-3 mt-1">
                    Por defecto las facturas son 0001, 0002... Puedes añadir un
                    prefijo como &ldquo;FAC-2026-&rdquo; para que queden FAC-2026-0001.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 6 — Revisar + activar ═══ */}
        {step === 6 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-ink flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand" />
                Todo listo
              </h2>
              <p className="text-sm text-ink-2 mt-1">
                Revisa lo que has configurado y dale al botón. Todo es editable
                después desde tu dashboard.
              </p>
            </div>

            <ReviewSection title="Negocio" icon={Store}>
              <ReviewItem label="Nombre" value={businessName} />
              <ReviewItem label="Dueño" value={ownerName} />
              <ReviewItem label="Teléfono" value={phone} />
              <ReviewItem label="Dirección" value={address || "—"} />
            </ReviewSection>

            <ReviewSection title="Equipo y servicios" icon={Users}>
              <ReviewItem label="Barberos" value={barbers.length > 0 ? barbers.join(", ") : "Solo tú"} />
              <ReviewItem
                label="Servicios"
                value={`${services.filter((s) => s.name.trim()).length} configurados`}
              />
            </ReviewSection>

            <ReviewSection title="Horario" icon={Clock}>
              {DAYS.map((day) => (
                <ReviewItem key={day} label={DAY_LABELS[day]} value={hours[day]} />
              ))}
            </ReviewSection>

            <ReviewSection title="Tu app pública" icon={Globe}>
              <ReviewItem label="URL" value={publicSlug ? `otracita.es/b/${publicSlug}` : "—"} />
              <ReviewItem label="Tema" value={brandTheme === "dark" ? "Oscuro" : "Claro"} />
              <ReviewItem
                label="Color"
                value={
                  (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-full border border-line" style={{ background: brandColor }} />
                      <span className="font-mono text-xs">{brandColor}</span>
                    </span>
                  ) as React.ReactNode
                }
              />
            </ReviewSection>

            <ReviewSection title="Facturación" icon={Receipt}>
              {invoicingEnabled ? (
                <>
                  <ReviewItem label="Estado" value="Activada — VeriFactu" />
                  <ReviewItem label="Razón social" value={fiscalName} />
                  <ReviewItem label="NIF" value={fiscalNif} />
                  <ReviewItem label="IVA" value={`${ivaRate}%`} />
                </>
              ) : (
                <ReviewItem label="Estado" value="Desactivada — puedes activarla después" />
              )}
            </ReviewSection>

            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-line">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-overlay hover:text-ink transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </button>
          ) : (
            <div />
          )}

          {step < 6 && (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance}
              className="flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-strong px-5 py-2.5 text-sm font-bold text-brand-ink transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {step === 6 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-strong px-6 py-3 text-sm font-bold text-brand-ink transition-colors active:scale-95 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Activando…" : "Activar mi cuenta"}
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────────────

function InputField({
  label, value, onChange, placeholder, required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink-2">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="bg-surface border border-line rounded-lg p-3 text-sm text-ink focus:border-brand outline-none transition-colors"
      />
    </div>
  )
}

function ThemeOption({
  label, icon: Icon, active, onClick, previewBg, previewInk,
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
        active ? "bg-surface shadow-sm ring-2 ring-brand" : "bg-overlay hover:bg-surface"
      }`}
      aria-pressed={active}
    >
      <span
        className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
        style={{ background: previewBg, color: previewInk }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className={active ? "text-ink" : "text-ink-2"}>{label}</span>
    </button>
  )
}

function ReviewSection({ title, icon: Icon, children }: { title: string; icon: typeof Store; children: React.ReactNode }) {
  return (
    <div className="bg-overlay/30 border border-line rounded-xl p-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-ink-3 mb-2.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3" />
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function ReviewItem({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-3 shrink-0">{label}</span>
      <span className="text-ink font-medium text-right truncate">{value || "—"}</span>
    </div>
  )
}

// Silence unused imports check
void Scissors
