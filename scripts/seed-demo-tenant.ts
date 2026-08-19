/**
 * Siembra COMPLETA del tenant de prueba de Reni (Private Studio).
 *
 * Datos del negocio reales (de su Booksy 90283_private-studio_barberia)
 * + histórico realista de 6 meses para que /dashboard/finanzas tenga
 * todas las vistas (mes, anual, comparativa año anterior) bien pobladas.
 *
 * Borra y vuelve a sembrar todo lo del tenant. Idempotente: corre tantas
 * veces como quieras.
 *
 *   npx tsx --env-file=.env.local scripts/seed-reni-complete.ts
 */
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import {
  clients,
  barbers,
  bookings,
  customers,
  expenses,
  fixedCosts,
  ownerWithdrawals,
  manualIncomes,
} from '../src/db/schema'

const EMAIL = 'reni@otracita.es'

// ────────────────────────── NEGOCIO ──────────────────────────
const BUSINESS = {
  name: 'Private Studio',
  ownerName: 'Reni',
  address: 'Carrer de Muntaner, 172, BAJO 01, 08036, Barcelona',
  city: 'Barcelona',
  booksy: 'https://booksy.com/es-es/90283_private-studio_barberia_48863_barcelona',
}

const HOURS = {
  monday: '10:00-20:00',
  tuesday: '10:00-20:00',
  wednesday: '10:00-20:00',
  thursday: '10:00-20:00',
  friday: '10:00-20:00',
  saturday: '10:00-15:00',
  sunday: 'closed',
}

const SERVICES = [
  { name: 'Corte de cabello', duration: 35, price: 20, weight: 35 },
  { name: 'Corte premium + asesoría', duration: 45, price: 25, weight: 12 },
  { name: 'Corte (cabello largo)', duration: 45, price: 25, weight: 5 },
  { name: 'Corte premium + cejas', duration: 45, price: 28, weight: 8 },
  { name: 'Corte + diseño de barba a navaja', duration: 50, price: 30, weight: 12 },
  { name: 'Corte + ritual de barba (presidencial)', duration: 60, price: 36, weight: 8 },
  { name: 'Ritual de barba (presidencial)', duration: 25, price: 16, weight: 6 },
  { name: 'Tinturación de barba', duration: 30, price: 15, weight: 3 },
  { name: 'Cover gray (camuflaje canas)', duration: 30, price: 30, weight: 2 },
  { name: 'Tinturación de cabello', duration: 30, price: 80, weight: 1 },
  { name: 'Mechas / iluminación masculina', duration: 60, price: 80, weight: 2 },
  { name: 'Tinturación rubio / gris', duration: 60, price: 80, weight: 1 },
  { name: 'Semi ondulación + corte', duration: 90, price: 80, weight: 1 },
  { name: 'Matiz shampoo', duration: 15, price: 10, weight: 1 },
  { name: 'Cejas con navaja', duration: 15, price: 4, weight: 1 },
  { name: 'Cejas con cera', duration: 10, price: 10, weight: 1 },
  { name: 'Nariz y orejas (cera)', duration: 10, price: 10, weight: 1 },
  { name: 'Combo waxing', duration: 10, price: 16, weight: 0.5 },
  { name: 'Repolarización hidratante', duration: 10, price: 10, weight: 0.5 },
]

const TEAM = [
  { name: 'Reni', displayOrder: 0 },
  { name: 'Jesús', displayOrder: 1 },
  { name: 'Daniel', displayOrder: 2 },
]

const DEMO_CUSTOMERS = [
  { name: 'Marc Puig', phone: '+34611100201' },
  { name: 'Antonio García', phone: '+34611100202' },
  { name: 'Iván Romero', phone: '+34611100203' },
  { name: 'Sergi Vidal', phone: '+34611100204' },
  { name: 'Pol Martín', phone: '+34611100205' },
  { name: 'Javier Soto', phone: '+34611100206' },
  { name: 'Adrián Cano', phone: '+34611100207' },
  { name: 'Luca Ferraro', phone: '+34611100208' },
  { name: 'Hugo Navarro', phone: '+34611100209' },
  { name: 'Bruno Esteve', phone: '+34611100210' },
  { name: 'Joan Ribas', phone: '+34611100211' },
  { name: 'Aleix Domingo', phone: '+34611100212' },
  { name: 'Roger Costa', phone: '+34611100213' },
  { name: 'Walk-in', phone: '+34600000001' },
  { name: 'Walk-in', phone: '+34600000002' },
]

// ────────────────────────── COSTES FIJOS ──────────────────────────
// Activos desde hace 12 meses. Importes en cents.
const FIXED_COSTS = [
  { name: 'Alquiler local Muntaner', amount: 150000, category: 'otro', sortOrder: 0 },
  { name: 'Cuota autónomo (TGSS)', amount: 32000, category: 'otro', sortOrder: 1 },
  { name: 'Gestor fiscal', amount: 10000, category: 'otro', sortOrder: 2 },
  { name: 'Luz + agua + internet', amount: 24000, category: 'suministros', sortOrder: 3 },
  { name: 'Limpieza local (semanal)', amount: 18000, category: 'suministros', sortOrder: 4 },
  { name: 'Spotify Business', amount: 2500, category: 'otro', sortOrder: 5 },
  { name: 'otracita (suscripción)', amount: 9900, category: 'otro', sortOrder: 6 },
]

// ────────────────────────── EXPENSES PER MONTH ──────────────────────────
// Gastos variables de ejemplo por mes. amount en cents.
const EXPENSE_TEMPLATES = [
  { cat: 'productos', notes: 'Cera Murray\'s + gel pomada (caja)', amount: 9800, dayOffset: 4 },
  { cat: 'productos', notes: 'Champú Redken (pack 6)', amount: 11400, dayOffset: 10 },
  { cat: 'productos', notes: 'Reposición navajas Feather', amount: 4500, dayOffset: 17 },
  { cat: 'productos', notes: 'After-shave + bálsamo barba', amount: 6700, dayOffset: 22 },
  { cat: 'suministros', notes: 'Toallas + papel + algodón', amount: 4200, dayOffset: 6 },
  { cat: 'suministros', notes: 'Café + agua + vasos sala espera', amount: 3500, dayOffset: 14 },
  { cat: 'suministros', notes: 'Bolsas + escoba + bayetas', amount: 2200, dayOffset: 25 },
  { cat: 'publicidad', notes: 'Instagram ads (Reels boost)', amount: 15000, dayOffset: 8 },
  { cat: 'publicidad', notes: 'Flyers Eixample (1000 ud)', amount: 6000, dayOffset: 20 },
  { cat: 'personal', notes: 'Café equipo + comida viernes', amount: 4800, dayOffset: 12 },
  { cat: 'otro', notes: 'Reparación silla hidráulica 2', amount: 8500, dayOffset: 16 },
  { cat: 'otro', notes: 'Cambio focos LED + bombillas', amount: 3200, dayOffset: 28 },
]

// ────────────────────────── HELPERS ──────────────────────────
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dateOnMonth(year: number, monthIdx: number, day: number): Date {
  // monthIdx: 0..11
  const d = new Date(Date.UTC(year, monthIdx, day))
  return d
}

function weightedPick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((a, b) => a + b.weight, 0)
  let r = Math.random() * total
  for (const it of items) {
    r -= it.weight
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function randomTime(): string {
  // Slots entre 10:00 y 19:30 en pasos de 30 min
  const slot = 10 * 60 + Math.floor(Math.random() * 20) * 30
  const h = Math.floor(slot / 60)
  const m = slot % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dayOfWeek(d: Date): number {
  return d.getUTCDay() // 0=Sun..6=Sat
}

function bookingsPerDay(dow: number): number {
  // 0=dom 1=lun 2=mar 3=mié 4=jue 5=vie 6=sáb
  if (dow === 0) return 0
  if (dow === 1) return 8 + Math.floor(Math.random() * 5)   // 8-12
  if (dow >= 2 && dow <= 4) return 10 + Math.floor(Math.random() * 5)  // 10-14
  if (dow === 5) return 12 + Math.floor(Math.random() * 5)  // 12-16
  if (dow === 6) return 10 + Math.floor(Math.random() * 7)  // 10-16 (cierra antes pero más demanda)
  return 0
}

// ────────────────────────── MAIN ──────────────────────────
async function main() {
  console.log('🔧 Seed completa Reni — Private Studio (datos reales + 6m histórico)\n')

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.email, EMAIL))
  if (!client) {
    console.error(`❌ No existe el tenant ${EMAIL}. Corre antes provision-reni.ts.`)
    process.exit(1)
  }
  const clientId = client.id

  console.log('1/8  Reset previo (bookings, customers, barbers, finanzas)…')
  await Promise.all([
    db.delete(bookings).where(eq(bookings.clientId, clientId)),
    db.delete(customers).where(eq(customers.clientId, clientId)),
    db.delete(expenses).where(eq(expenses.clientId, clientId)),
    db.delete(fixedCosts).where(eq(fixedCosts.clientId, clientId)),
    db.delete(ownerWithdrawals).where(eq(ownerWithdrawals.clientId, clientId)),
    db.delete(manualIncomes).where(eq(manualIncomes.clientId, clientId)),
  ])
  await db.delete(barbers).where(eq(barbers.clientId, clientId))
  console.log('     ✓ limpio')

  console.log('2/8  Update clients (negocio + servicios + horario)…')
  await db
    .update(clients)
    .set({
      businessName: BUSINESS.name,
      ownerName: BUSINESS.ownerName,
      address: BUSINESS.address,
      city: BUSINESS.city,
      chatbotServices: SERVICES.map(({ name, duration, price }) => ({ name, duration, price })),
      chatbotHours: HOURS,
      booksyProfileUrl: BUSINESS.booksy,
      ivaRate: 21,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId))
  console.log('     ✓ negocio actualizado')

  console.log('3/8  Team…')
  const barberRows = await db
    .insert(barbers)
    .values(
      TEAM.map((b) => ({
        clientId,
        name: b.name,
        displayOrder: b.displayOrder,
        hours: null,
        blockedDates: [],
        active: true,
      })),
    )
    .returning({ id: barbers.id, name: barbers.name })
  console.log(`     ✓ ${barberRows.length} barberos`)

  console.log('4/8  Customers ficticios…')
  await db.insert(customers).values(
    DEMO_CUSTOMERS.map((c, i) => ({
      clientId,
      phone: c.phone,
      name: c.name,
      totalBookings: 10 + (i * 3) % 40,
      reputation: 'good' as const,
    })),
  )
  console.log(`     ✓ ${DEMO_CUSTOMERS.length} customers`)

  console.log('5/8  Bookings — histórico 6 meses + próximos 7 días…')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const todayISO = isoDate(today)
  const bookingsRows: typeof bookings.$inferInsert[] = []

  // Rango: 6 meses atrás hasta +7 días
  const startDate = new Date(today)
  startDate.setUTCMonth(startDate.getUTCMonth() - 6)
  const endDate = new Date(today)
  endDate.setUTCDate(endDate.getUTCDate() + 7)

  for (let cur = new Date(startDate); cur <= endDate; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const dow = dayOfWeek(cur)
    if (dow === 0) continue // domingo cerrado
    const n = bookingsPerDay(dow)
    const dateStr = isoDate(cur)
    const usedSlots = new Set<string>()

    for (let i = 0; i < n; i++) {
      const svc = weightedPick(SERVICES)
      const cust = pickRandom(DEMO_CUSTOMERS)
      const barber = pickRandom(barberRows)
      let time = randomTime()
      // Evitar colisiones del mismo barbero en mismo slot
      const key = `${barber.id}-${time}`
      if (usedSlots.has(key)) {
        time = randomTime()
      }
      usedSlots.add(`${barber.id}-${time}`)

      // Status: completadas si la fecha es < hoy; mezcla si es hoy; confirmed si futuro
      let status: 'confirmed' | 'completed' | 'no_show' | 'cancelled' = 'confirmed'
      if (dateStr < todayISO) {
        // Mayoría completadas, 5% no_show, 2% cancelled
        const r = Math.random()
        status = r < 0.93 ? 'completed' : r < 0.98 ? 'no_show' : 'cancelled'
      } else if (dateStr === todayISO) {
        const slotHour = parseInt(time.slice(0, 2), 10)
        const currentHour = new Date().getUTCHours() + 2 // BCN ~UTC+2
        status = slotHour < currentHour ? 'completed' : 'confirmed'
      }

      bookingsRows.push({
        clientId,
        customerPhone: cust.phone,
        customerName: cust.name,
        service: svc.name,
        barberId: barber.id,
        barber: barber.name,
        date: dateStr,
        time,
        duration: svc.duration,
        priceCents:
          // El catálogo del seed está en euros; la cita se persiste en céntimos.
          status === 'cancelled' || status === 'no_show'
            ? null
            : Math.round(svc.price * 100),
        status,
        source: 'bot' as const,
        reminderSent: status === 'completed',
        paymentMethod: status === 'completed' ? (Math.random() < 0.45 ? 'card' : Math.random() < 0.7 ? 'cash' : 'online') : null,
      })
    }
  }

  // Insertar en batches de 500 para no estresar
  for (let i = 0; i < bookingsRows.length; i += 500) {
    await db.insert(bookings).values(bookingsRows.slice(i, i + 500))
  }
  console.log(`     ✓ ${bookingsRows.length} bookings (~6 meses)`)

  console.log('6/8  Fixed costs (alquiler, autónomo, gestor, suministros…)…')
  const activeFromDate = new Date(today)
  activeFromDate.setUTCMonth(activeFromDate.getUTCMonth() - 12)
  await db.insert(fixedCosts).values(
    FIXED_COSTS.map((fc) => ({
      clientId,
      name: fc.name,
      amountCents: fc.amount,
      category: fc.category,
      activeFrom: isoDate(activeFromDate),
      active: true,
      sortOrder: fc.sortOrder,
    })),
  )
  const totalFijos = FIXED_COSTS.reduce((a, b) => a + b.amount, 0)
  console.log(`     ✓ ${FIXED_COSTS.length} costes fijos (total mensual: ${(totalFijos / 100).toFixed(0)} €)`)

  console.log('7/8  Expenses + Owner withdrawals (6 meses)…')
  const expenseRows: typeof expenses.$inferInsert[] = []
  const withdrawalRows: typeof ownerWithdrawals.$inferInsert[] = []
  const manualIncomeRows: typeof manualIncomes.$inferInsert[] = []

  for (let monthsAgo = 6; monthsAgo >= 0; monthsAgo--) {
    const ref = new Date(today)
    ref.setUTCMonth(ref.getUTCMonth() - monthsAgo)
    const y = ref.getUTCFullYear()
    const m = ref.getUTCMonth()
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

    // Expenses (filtrar a futuro)
    for (const tpl of EXPENSE_TEMPLATES) {
      const day = Math.min(tpl.dayOffset, lastDay)
      const expDate = dateOnMonth(y, m, day)
      if (expDate > today) continue
      // Variación ±25%
      const variation = 0.75 + Math.random() * 0.5
      expenseRows.push({
        clientId,
        date: isoDate(expDate),
        amountCents: Math.round(tpl.amount * variation),
        category: tpl.cat,
        notes: tpl.notes,
      })
    }

    // Owner withdrawal el día 28 de cada mes
    const wDay = Math.min(28, lastDay)
    const wDate = dateOnMonth(y, m, wDay)
    if (wDate <= today) {
      withdrawalRows.push({
        clientId,
        date: isoDate(wDate),
        amountCents: 200000 + Math.floor(Math.random() * 60000), // 2000-2600 €
        notes: 'Sueldo dueño',
      })
    }

    // Manual income ocasional (propinas/venta producto) ~50%
    if (Math.random() < 0.5) {
      const miDate = dateOnMonth(y, m, 15)
      if (miDate <= today) {
        manualIncomeRows.push({
          clientId,
          date: isoDate(miDate),
          amountCents: 8000 + Math.floor(Math.random() * 12000), // 80-200 €
          notes: 'Venta producto + propinas no registradas',
        })
      }
    }
  }

  await db.insert(expenses).values(expenseRows)
  await db.insert(ownerWithdrawals).values(withdrawalRows)
  if (manualIncomeRows.length > 0) await db.insert(manualIncomes).values(manualIncomeRows)
  console.log(`     ✓ ${expenseRows.length} gastos variables, ${withdrawalRows.length} retiros, ${manualIncomeRows.length} ingresos manuales`)

  console.log('8/8  Resumen…')
  // Stats rápidas para mostrar a Alex
  const completedCount = bookingsRows.filter((b) => b.status === 'completed').length
  const completedRevenueEur =
    bookingsRows
      .filter((b) => b.status === 'completed' && b.priceCents)
      .reduce((a, b) => a + (b.priceCents ?? 0), 0) / 100
  console.log(`     · Bookings completadas: ${completedCount}`)
  console.log(`     · Facturación bruta histórica: ${completedRevenueEur.toFixed(0)} € (6 meses)`)
  console.log(`     · Costes fijos mensuales: ${(totalFijos / 100).toFixed(0)} €`)
  console.log(`     · Total gastos variables: ${(expenseRows.reduce((a, b) => a + b.amountCents, 0) / 100).toFixed(0)} €`)
  console.log(`     · Total retiros dueño: ${(withdrawalRows.reduce((a, b) => a + b.amountCents, 0) / 100).toFixed(0)} €`)

  console.log('\n✅ Hecho. Ahora /dashboard/finanzas tiene datos en mes actual, anual y comparativa año anterior.\n')
  console.log(`   Login: https://otracita.es/login`)
  console.log(`   PWA:   https://otracita.es/b/reni-test`)
  console.log(`   P&L:   https://otracita.es/dashboard/finanzas`)
  console.log()
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
