/**
 * Provisiona la cuenta de prueba de Reni para que pruebe el producto:
 *   · user Better Auth (email + password)
 *   · tenant `clients` (tier estudio, status active)
 *   · 3 barberos + 5 servicios + horario semanal
 *   · 5 customers + 8 reservas demo en los próximos 5 días
 *
 * Idempotente: si ya existe el cliente con ese email, sale sin tocar nada.
 *
 *   npx tsx --env-file=.env.local scripts/provision-reni.ts
 */
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { auth } from '../src/lib/auth'
import { db } from '../src/db'
import { clients, barbers, bookings, customers } from '../src/db/schema'

const EMAIL = 'reni@otracita.es'
const BUSINESS_NAME = 'Reni — Test'
const OWNER_NAME = 'Reni'
const PHONE = '+34600000000'
const TIER = 'estudio'
const PUBLIC_SLUG = 'reni-test'

const SERVICES = [
  { name: 'Corte clásico', duration: 30, price: 18 },
  { name: 'Corte + barba', duration: 45, price: 25 },
  { name: 'Solo barba', duration: 20, price: 12 },
  { name: 'Tinte', duration: 60, price: 35 },
  { name: 'Niño (-12)', duration: 25, price: 14 },
]

const HOURS = {
  monday: '10:00-20:00',
  tuesday: '10:00-20:00',
  wednesday: '10:00-20:00',
  thursday: '10:00-20:00',
  friday: '10:00-20:00',
  saturday: '10:00-14:00',
  sunday: 'closed',
}

const TEAM = [
  { name: 'Reni', displayOrder: 0 },
  { name: 'Luis', displayOrder: 1 },
  { name: 'Marta', displayOrder: 2 },
]

const DEMO_CUSTOMERS = [
  { name: 'Antonio García', phone: '+34600000101' },
  { name: 'Marc Puig', phone: '+34600000102' },
  { name: 'Laura Sánchez', phone: '+34600000103' },
  { name: 'Iván Romero', phone: '+34600000104' },
  { name: 'Sofía Martín', phone: '+34600000105' },
]

const DEMO_BOOKINGS: Array<{
  day: number
  time: string
  customer: number
  service: number
  barber: number
}> = [
  { day: 0, time: '11:00', customer: 0, service: 0, barber: 0 },
  { day: 0, time: '12:30', customer: 1, service: 1, barber: 1 },
  { day: 0, time: '17:00', customer: 2, service: 2, barber: 0 },
  { day: 1, time: '10:30', customer: 3, service: 0, barber: 2 },
  { day: 1, time: '16:00', customer: 4, service: 3, barber: 1 },
  { day: 2, time: '11:00', customer: 0, service: 1, barber: 0 },
  { day: 3, time: '18:30', customer: 2, service: 4, barber: 2 },
  { day: 5, time: '13:00', customer: 1, service: 0, barber: 1 },
]

function genPassword(len = 16): string {
  return crypto
    .randomBytes(18)
    .toString('base64')
    .replace(/[+/=]/g, '')
    .slice(0, len)
}

function isoDate(daysFromToday: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysFromToday)
  return d.toISOString().slice(0, 10)
}

async function main() {
  console.log('🔧 Provisioning tenant: Reni\n')

  const dup = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.email, EMAIL))
  if (dup.length > 0) {
    console.error(
      `❌ Cliente ${EMAIL} ya existe (id=${dup[0].id}). Bórralo desde /admin/clients y re-corre.`,
    )
    process.exit(1)
  }

  const password = genPassword()

  console.log('1/5  Better Auth user…')
  try {
    await auth.api.signUpEmail({
      body: { email: EMAIL, password, name: OWNER_NAME },
      headers: new Headers(),
    })
  } catch (err) {
    console.error('     ✗ signUpEmail falló:', err)
    process.exit(1)
  }
  console.log('     ✓ user creado')

  console.log('2/5  Clients row (tenant)…')
  const [created] = await db
    .insert(clients)
    .values({
      businessName: BUSINESS_NAME,
      ownerName: OWNER_NAME,
      email: EMAIL,
      phone: PHONE,
      city: 'Barcelona',
      tier: TIER,
      status: 'active',
      plan: 'full',
      chatbotServices: SERVICES,
      chatbotHours: HOURS,
      blockedDates: [],
      publicSlug: PUBLIC_SLUG,
      publicEnabled: true,
      invoicingEnabled: false,
      cashRegisterEnabled: true,
    })
    .returning({ id: clients.id })
  console.log(`     ✓ client id=${created.id}`)

  console.log('3/5  Team (3 barberos)…')
  const barberRows = await db
    .insert(barbers)
    .values(
      TEAM.map((b) => ({
        clientId: created.id,
        name: b.name,
        displayOrder: b.displayOrder,
        hours: null,
        blockedDates: [],
        active: true,
      })),
    )
    .returning({ id: barbers.id, name: barbers.name })
  console.log(`     ✓ ${barberRows.length} barberos`)

  console.log('4/5  Customers demo…')
  await db.insert(customers).values(
    DEMO_CUSTOMERS.map((c) => ({
      clientId: created.id,
      phone: c.phone,
      name: c.name,
      totalBookings: 1,
    })),
  )
  console.log(`     ✓ ${DEMO_CUSTOMERS.length} customers`)

  console.log('5/5  Reservas demo…')
  await db.insert(bookings).values(
    DEMO_BOOKINGS.map((b) => {
      const svc = SERVICES[b.service]
      const cust = DEMO_CUSTOMERS[b.customer]
      const barber = barberRows[b.barber]
      return {
        clientId: created.id,
        customerPhone: cust.phone,
        customerName: cust.name,
        service: svc.name,
        barberId: barber.id,
        barber: barber.name,
        date: isoDate(b.day),
        time: b.time,
        duration: svc.duration,
        price: svc.price,
        status: 'confirmed',
        source: 'bot',
        reminderSent: false,
      }
    }),
  )
  console.log(`     ✓ ${DEMO_BOOKINGS.length} reservas`)

  console.log('\n✅ Hecho. Credenciales:\n')
  console.log(`   URL:      https://otracita.es/login`)
  console.log(`   Email:    ${EMAIL}`)
  console.log(`   Password: ${password}`)
  console.log(`   PWA:      https://otracita.es/b/${PUBLIC_SLUG}`)
  console.log()
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Provision failed:', err)
    process.exit(1)
  })
