import { auth } from "@/lib/auth/server"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { data: session } = await auth.getSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const formData = await request.formData()
  const businessName = formData.get("businessName") as string
  const ownerName = formData.get("ownerName") as string
  const phone = formData.get("phone") as string
  const city = formData.get("city") as string
  const address = formData.get("address") as string
  const booksyUrl = formData.get("booksyUrl") as string
  const googleCalendarId = formData.get("googleCalendarId") as string
  const servicesRaw = formData.get("services") as string
  const barbersRaw = formData.get("barbers") as string
  const hoursRaw = formData.get("hours") as string

  let chatbotServices = null
  let booksyServicesBarbers = null
  let chatbotHours = null
  try {
    if (servicesRaw) chatbotServices = JSON.parse(servicesRaw)
    if (barbersRaw) booksyServicesBarbers = JSON.parse(barbersRaw).map((name: string) => ({ name }))
    if (hoursRaw) chatbotHours = JSON.parse(hoursRaw)
  } catch {
    // ignore parse error
  }

  if (!businessName || !ownerName || !phone) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 })
  }

  const email = session.user.email

  try {
    const records = await db.select().from(clients).where(eq(clients.email, email))

    if (records.length > 0) {
      // Update existing client
      await db.update(clients)
        .set({
          businessName,
          ownerName,
          phone,
          whatsappNumber: phone,
          city: city || "Barcelona",
          address: address || null,
          booksyProfileUrl: booksyUrl || null,
          googleCalendarId: googleCalendarId || null,
          chatbotServices: chatbotServices,
          booksyServices: booksyServicesBarbers,
          chatbotHours: chatbotHours,
          status: "onboarding",
          updatedAt: new Date(),
          onboardedAt: new Date(),
        })
        .where(eq(clients.id, records[0].id))
    } else {
      // Create new client
      await db.insert(clients).values({
        businessName,
        ownerName,
        email,
        phone,
        whatsappNumber: phone,
        city: city || "Barcelona",
        address: address || null,
        booksyProfileUrl: booksyUrl || null,
        googleCalendarId: googleCalendarId || null,
        chatbotServices: chatbotServices,
        booksyServices: booksyServicesBarbers,
        chatbotHours: chatbotHours,
        status: "onboarding",
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Setup error:", e)
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 })
  }
}
