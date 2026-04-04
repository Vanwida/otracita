import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/db"
import { clients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth/server";
import BlockedDatesManager from "@/app/dashboard/_components/BlockedDatesManager";
import ServicesManager from "@/app/dashboard/_components/ServicesManager";

interface ServiceItem {
  name: string
  duration: string | number
  price: string | number
}

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.email) {
    redirect("/login");
  }

  let clientData = null
  if (session.user?.email) {
    const records = await db.select().from(clients).where(eq(clients.email, session.user.email))
    clientData = records[0]
  }

  const existingServices = (clientData?.chatbotServices as ServiceItem[] | null) || []

  async function updateSettings(formData: FormData) {
    "use server"
    const { auth: serverAuth } = await import("@/lib/auth/server")
    const { headers: getHeaders } = await import("next/headers")
    const sessionConfig = await serverAuth.api.getSession({ headers: await getHeaders() })
    if (!sessionConfig?.user?.email) return

    const businessName = formData.get("businessName") as string
    const whatsappNumber = formData.get("whatsappNumber") as string
    const googleCalendarId = formData.get("googleCalendarId") as string
    const address = formData.get("address") as string
    const chatbotGreeting = formData.get("chatbotGreeting") as string
    const booksyProfileUrl = formData.get("booksyProfileUrl") as string
    const servicesRaw = formData.get("services") as string

    let chatbotServices = null
    try {
      if (servicesRaw) chatbotServices = JSON.parse(servicesRaw)
    } catch {
      // ignore
    }

    const email = sessionConfig!.user.email

    try {
      const { db } = await import("@/db")
      const { clients } = await import("@/db/schema")
      const { eq } = await import("drizzle-orm")

      const records = await db.select().from(clients).where(eq(clients.email, email))
      if (records.length > 0) {
        await db.update(clients)
          .set({
            businessName,
            whatsappNumber,
            googleCalendarId: googleCalendarId || null,
            address: address || null,
            chatbotGreeting: chatbotGreeting || null,
            booksyProfileUrl: booksyProfileUrl || null,
            chatbotServices: chatbotServices,
            updatedAt: new Date()
          })
          .where(eq(clients.id, records[0].id))
      } else {
        await db.insert(clients).values({
          businessName: businessName || "Mi Negocio",
          ownerName: sessionConfig!.user.name || "Dueno",
          email: email,
          phone: whatsappNumber || "",
          whatsappNumber: whatsappNumber,
          googleCalendarId: googleCalendarId || null,
          address: address || null,
          chatbotGreeting: chatbotGreeting || null,
          booksyProfileUrl: booksyProfileUrl || null,
          chatbotServices: chatbotServices,
          status: "pending",
        })
      }
      const { revalidatePath } = await import("next/cache")
      revalidatePath("/dashboard/settings")
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Ajustes del Bot</h1>
        <p className="text-neutral-500">Administra la configuracion de tu chatbot y datos de negocio.</p>
      </div>

      <form action={updateSettings} className="space-y-8 bg-[#141414] border border-[#262626] rounded-xl p-4 md:p-8">
        {/* Business Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Informacion del Negocio</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="businessName" className="text-sm font-medium text-neutral-400">Nombre del Local / Negocio</label>
              <input
                id="businessName"
                name="businessName"
                type="text"
                defaultValue={clientData?.businessName || ""}
                placeholder="Ej. Barberia Central"
                className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="whatsappNumber" className="text-sm font-medium text-neutral-400">Numero de WhatsApp (Con codigo pais)</label>
              <input
                id="whatsappNumber"
                name="whatsappNumber"
                type="text"
                defaultValue={clientData?.whatsappNumber || clientData?.phone || ""}
                placeholder="+34 600..."
                className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="address" className="text-sm font-medium text-neutral-400">Direccion</label>
            <input
              id="address"
              name="address"
              type="text"
              defaultValue={clientData?.address || ""}
              placeholder="Calle Gran Via 123, Barcelona"
              className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Chatbot Greeting */}
        <div className="border-t border-[#1f1f1f] pt-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">Mensaje de Bienvenida del Bot</h2>
          <p className="text-sm text-neutral-500">Este mensaje se enviara automaticamente cuando un cliente nuevo escriba por WhatsApp.</p>
          <div className="flex flex-col gap-2">
            <textarea
              id="chatbotGreeting"
              name="chatbotGreeting"
              rows={3}
              defaultValue={clientData?.chatbotGreeting || ""}
              placeholder="Ej: Hola! Bienvenido a [tu negocio]. Soy tu asistente virtual. Como puedo ayudarte hoy?"
              className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors resize-none"
            />
          </div>
        </div>

        {/* Booksy / Calendar */}
        <div className="border-t border-[#1f1f1f] pt-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">Booksy y Google Calendar</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="booksyProfileUrl" className="text-sm font-medium text-neutral-400">URL de Perfil Booksy</label>
              <input
                id="booksyProfileUrl"
                name="booksyProfileUrl"
                type="text"
                defaultValue={clientData?.booksyProfileUrl || ""}
                placeholder="https://booksy.com/es-es/..."
                className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="googleCalendarId" className="text-sm font-medium text-neutral-400">Google Calendar ID</label>
              <input
                id="googleCalendarId"
                name="googleCalendarId"
                type="text"
                defaultValue={clientData?.googleCalendarId || ""}
                placeholder="tu-correo@group.calendar.google.com"
                className="bg-[#0f0f0f] border border-[#262626] rounded-lg p-3 text-sm text-white focus:border-emerald-500 outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Services */}
        <div className="border-t border-[#1f1f1f] pt-8 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Servicios</h2>
            <p className="text-sm text-neutral-500 mt-1">Los servicios que ofrece tu negocio. El bot los usará para las reservas.</p>
          </div>
          <ServicesManager initial={existingServices.map(s => ({ name: String(s.name), duration: s.duration, price: s.price }))} />
        </div>

        <div className="pt-4 flex items-center justify-end">
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-8 py-3 text-sm font-bold text-black transition-colors active:scale-95"
          >
            Guardar Configuracion
          </button>
        </div>
      </form>

      {/* Blocked Dates — outside the form, managed via API */}
      <div className="mt-8 bg-[#141414] border border-[#262626] rounded-xl p-4 md:p-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Dias Bloqueados</h2>
          <p className="text-sm text-neutral-500 mt-1">Bloquea fechas especificas (vacaciones, festivos) para que el bot no ofrezca esos dias.</p>
        </div>
        <BlockedDatesManager
          initialDates={(clientData?.blockedDates as string[]) || []}
          clientId={clientData?.id || ''}
        />
      </div>
    </div>
  )
}
