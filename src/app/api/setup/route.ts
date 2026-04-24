import { auth } from "@/lib/auth/server"
import { db } from "@/db"
import { barbers as barbersTable, clients } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { ensureUniqueSlug, isValidSlug, slugifyName } from "@/lib/slug"

// -----------------------------------------------------------------------------
// POST /api/setup — Onboarding de un cliente nuevo (barbero).
//
// Wizard server-side: recibe formData con TODOS los bloques del wizard y los
// persiste en clients + barbers (tabla dedicada). Campos:
//   · Negocio: nombre, dueño, phone, city, address
//   · Booksy URL (opcional, informativo)
//   · Servicios (JSON)
//   · Barberos (array de nombres → filas en tabla barbers)
//   · Horario (JSON)
//   · App pública: slug, brandTheme, brandColor, publicDescription, publicEnabled
//   · Facturación: invoicingEnabled, fiscalName, fiscalNif, fiscalAddress,
//     fiscalCity, fiscalPostalCode, ivaRate, invoiceNumberPrefix
//
// Reglas de integridad:
//   - invoicingEnabled solo queda true si TODOS los datos fiscales están.
//     RD 1619/2012 art. 6 exige nombre + NIF + dirección completa del emisor.
//   - Slug se saneaa via slugifyName + ensureUniqueSlug para evitar colisión.
//   - Status pasa a 'onboarding' (luego el admin lo activa a 'active').
// -----------------------------------------------------------------------------

function cleanString(v: FormDataEntryValue | null, max = 200): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s ? s.slice(0, max) : null
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.email) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const fd = await request.formData()

  // ── Negocio ──
  const businessName = cleanString(fd.get("businessName"), 120)
  const ownerName = cleanString(fd.get("ownerName"), 80)
  const phone = cleanString(fd.get("phone"), 30)
  const city = cleanString(fd.get("city"), 60) ?? "Barcelona"
  const address = cleanString(fd.get("address"), 200)
  const booksyUrl = cleanString(fd.get("booksyUrl"), 400)

  // ── JSON blobs ──
  const servicesRaw = fd.get("services") as string | null
  const barbersRaw = fd.get("barbers") as string | null
  const hoursRaw = fd.get("hours") as string | null

  let chatbotServices: unknown = null
  let barbersList: string[] = []
  let chatbotHours: unknown = null
  try {
    if (servicesRaw) chatbotServices = JSON.parse(servicesRaw)
  } catch { /* ignore */ }
  try {
    if (barbersRaw) {
      const parsed = JSON.parse(barbersRaw)
      if (Array.isArray(parsed)) barbersList = parsed.filter((n) => typeof n === "string" && n.trim().length > 0)
    }
  } catch { /* ignore */ }
  try {
    if (hoursRaw) chatbotHours = JSON.parse(hoursRaw)
  } catch { /* ignore */ }

  // ── App pública ──
  const slugRaw = cleanString(fd.get("publicSlug"), 60) ?? ""
  const brandTheme = fd.get("brandTheme") === "dark" ? "dark" : "light"
  const brandColor = cleanString(fd.get("brandColor"), 7)
  const brandColorValid = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#111111"
  const publicDescription = cleanString(fd.get("publicDescription"), 600)

  // ── Facturación ──
  const invoicingEnabledRequested = fd.get("invoicingEnabled") === "on"
  const fiscalName = cleanString(fd.get("fiscalName"), 120)
  const fiscalNif = cleanString(fd.get("fiscalNif"), 20)
  const fiscalAddress = cleanString(fd.get("fiscalAddress"), 200)
  const fiscalCity = cleanString(fd.get("fiscalCity"), 60)
  const fiscalPostalCode = cleanString(fd.get("fiscalPostalCode"), 10)
  const ivaRateRaw = parseInt((fd.get("ivaRate") as string | null) ?? "21", 10)
  const ivaRate = [0, 4, 10, 21].includes(ivaRateRaw) ? ivaRateRaw : 21
  const invoiceNumberPrefix = cleanString(fd.get("invoiceNumberPrefix"), 20) ?? ""
  // Regla RD 1619/2012 art. 6 — invoicing on sólo si todos los fiscal fields están
  const canEnableInvoicing =
    !!fiscalName && !!fiscalNif && !!fiscalAddress && !!fiscalCity && !!fiscalPostalCode
  const invoicingEnabled = invoicingEnabledRequested && canEnableInvoicing

  // ── Validación obligatoria ──
  if (!businessName || !ownerName || !phone) {
    return NextResponse.json({ error: "Faltan campos obligatorios del negocio." }, { status: 400 })
  }

  // ── Slug — saneo + unicidad ──
  let publicSlug: string | null = null
  if (slugRaw) {
    const normalised = slugifyName(slugRaw)
    if (normalised && isValidSlug(normalised)) {
      publicSlug = await ensureUniqueSlug(normalised, "")
    }
  }
  // Si no hay slug válido, intenta derivar del nombre del negocio
  if (!publicSlug) {
    const derived = slugifyName(businessName)
    if (derived && isValidSlug(derived)) {
      publicSlug = await ensureUniqueSlug(derived, "")
    }
  }

  const email = session.user.email

  try {
    const records = await db.select().from(clients).where(eq(clients.email, email))

    let clientId: string
    if (records.length > 0) {
      clientId = records[0].id
      // Si existe, verificamos slug único excluyendo al propio cliente
      if (publicSlug) {
        publicSlug = await ensureUniqueSlug(publicSlug, clientId)
      }
      await db.update(clients)
        .set({
          businessName,
          ownerName,
          phone,
          whatsappNumber: phone,
          city,
          address,
          booksyProfileUrl: booksyUrl,
          chatbotServices,
          chatbotHours,
          publicSlug,
          publicEnabled: !!publicSlug,
          brandTheme,
          brandColor: brandColorValid,
          publicDescription,
          invoicingEnabled,
          fiscalName,
          fiscalNif,
          fiscalAddress,
          fiscalCity,
          fiscalPostalCode,
          ivaRate,
          invoiceNumberPrefix,
          status: "onboarding",
          updatedAt: new Date(),
          onboardedAt: new Date(),
        })
        .where(eq(clients.id, clientId))
    } else {
      const [inserted] = await db.insert(clients).values({
        businessName,
        ownerName,
        email,
        phone,
        whatsappNumber: phone,
        city,
        address,
        booksyProfileUrl: booksyUrl,
        chatbotServices,
        chatbotHours,
        publicSlug,
        publicEnabled: !!publicSlug,
        brandTheme,
        brandColor: brandColorValid,
        publicDescription,
        invoicingEnabled,
        fiscalName,
        fiscalNif,
        fiscalAddress,
        fiscalCity,
        fiscalPostalCode,
        ivaRate,
        invoiceNumberPrefix,
        status: "onboarding",
        onboardedAt: new Date(),
      }).returning({ id: clients.id })
      clientId = inserted.id
    }

    // ── Sync de barberos ──
    // Estrategia simple: activar los que vienen, desactivar los antiguos que
    // ya no figuran. Barberos con reservas futuras quedan activos igualmente
    // (soft delete protegido). Esto respeta el invariante de "al menos 1
    // barbero activo" al crear uno si no hay ninguno.
    if (barbersList.length > 0) {
      const existing = await db.select().from(barbersTable).where(eq(barbersTable.clientId, clientId))
      const existingByName = new Map(existing.map((b) => [b.name.trim().toLowerCase(), b]))
      const wantedSet = new Set(barbersList.map((n) => n.trim().toLowerCase()))

      // Activar/crear los que vienen
      for (let i = 0; i < barbersList.length; i++) {
        const name = barbersList[i].trim()
        const key = name.toLowerCase()
        const match = existingByName.get(key)
        if (match) {
          if (!match.active || match.displayOrder !== i) {
            await db.update(barbersTable)
              .set({ active: true, displayOrder: i, updatedAt: new Date() })
              .where(eq(barbersTable.id, match.id))
          }
        } else {
          await db.insert(barbersTable).values({ clientId, name, active: true, displayOrder: i })
        }
      }

      // Desactivar los sobrantes (NO los borramos — conservan historial)
      for (const [key, row] of existingByName) {
        if (!wantedSet.has(key) && row.active) {
          await db.update(barbersTable)
            .set({ active: false, updatedAt: new Date() })
            .where(and(eq(barbersTable.id, row.id), eq(barbersTable.clientId, clientId)))
        }
      }
    }

    return NextResponse.json({
      success: true,
      slug: publicSlug,
      publicUrl: publicSlug ? `/b/${publicSlug}` : null,
    })
  } catch (e) {
    console.error("Setup error:", e)
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 })
  }
}
