import test from 'node:test'
import assert from 'node:assert/strict'
import { isBackfilledImport, isImportSource, isSelfServiceSource } from './source.ts'

// El cliente bloqueado solo se rechaza en canales self-service. Si esta
// clasificación se rompe, un bloqueado podría reservar por bot/PWA (falso
// negativo) o el barbero no podría agendarlo a mano (falso positivo).

test('isSelfServiceSource — bot/web/voice son self-service', () => {
  assert.equal(isSelfServiceSource('bot'), true)
  assert.equal(isSelfServiceSource('web'), true)
  assert.equal(isSelfServiceSource('voice'), true)
})

test('isSelfServiceSource — dashboard e import NO son self-service', () => {
  assert.equal(isSelfServiceSource('dashboard'), false)
  assert.equal(isSelfServiceSource('import'), false)
})

test('isSelfServiceSource — origen desconocido no se trata como self-service', () => {
  assert.equal(isSelfServiceSource('unknown'), false)
  assert.equal(isSelfServiceSource(''), false)
})

// -----------------------------------------------------------------------------
// L-15 — backfills de importación no son ingresos de otracita.
//
// El sweep de cron/reminders cierra a `completed` toda cita `confirmed` de
// hace >3 días, y `completed` + `price` es lo que suma en ingresos. Si un
// backfill de junio se cuela, la caja de junio se infla con dinero cobrado
// en Booksy.
// -----------------------------------------------------------------------------

const TZ = 'Europe/Madrid'

test('isImportSource — las dos puertas de importación', () => {
  assert.equal(isImportSource('import'), true) // capturas vía Vision
  assert.equal(isImportSource('import_ical'), true) // export .ics de Booksy
  assert.equal(isImportSource('bot'), false)
  assert.equal(isImportSource('dashboard'), false)
  assert.equal(isImportSource('booksy'), false) // email inbound: cita real de otracita
  assert.equal(isImportSource(''), false)
})

test('backfill: cita de junio importada en agosto NO se cierra sola', () => {
  assert.equal(
    isBackfilledImport(
      { source: 'import', date: '2026-06-12', createdAt: new Date('2026-08-19T09:00:00Z') },
      TZ,
    ),
    true,
  )
})

test('backfill: también por .ics, y por el UID aunque cambie el tag de source', () => {
  assert.equal(
    isBackfilledImport(
      { source: 'import_ical', date: '2026-06-12', createdAt: new Date('2026-08-19T09:00:00Z') },
      TZ,
    ),
    true,
  )
  assert.equal(
    isBackfilledImport(
      {
        source: 'bot',
        date: '2026-06-12',
        createdAt: new Date('2026-08-19T09:00:00Z'),
        importedIcalUid: 'evt-booksy-991@booksy.com',
      },
      TZ,
    ),
    true,
  )
})

test('NO es backfill: cita importada con fecha futura — esa sí es ingreso de otracita', () => {
  // Migras el 1 de agosto y te traes las citas del 5. Ocurren aquí, las cobras
  // aquí: el sweep las tiene que seguir cerrando como cualquier otra.
  assert.equal(
    isBackfilledImport(
      { source: 'import', date: '2026-08-05', createdAt: new Date('2026-08-01T10:00:00Z') },
      TZ,
    ),
    false,
  )
})

test('NO es backfill: mismo día del import (borde) — se cierra normal', () => {
  assert.equal(
    isBackfilledImport(
      { source: 'import', date: '2026-08-19', createdAt: new Date('2026-08-19T09:00:00Z') },
      TZ,
    ),
    false,
  )
})

test('NO es backfill: cita vieja NO importada (bot/dashboard) — el sweep sigue igual', () => {
  // La red de seguridad de 3 días no se toca para las citas de siempre.
  for (const source of ['bot', 'web', 'voice', 'dashboard', 'booksy']) {
    assert.equal(
      isBackfilledImport(
        { source, date: '2026-06-12', createdAt: new Date('2026-08-19T09:00:00Z') },
        TZ,
      ),
      false,
      `source=${source} no debería tratarse como backfill`,
    )
  }
})

test('sin createdAt: conservador — no la metemos en caja', () => {
  assert.equal(
    isBackfilledImport({ source: 'import', date: '2026-06-12', createdAt: null }, TZ),
    true,
  )
})

test('createdAt de madrugada: se data en hora de Madrid, no en UTC', () => {
  // 2026-06-12T23:30Z = 13 de junio 01:30 en Madrid. Una cita del 13 de junio
  // NO es pasado para quien la importó ya de madrugada del 13.
  assert.equal(
    isBackfilledImport(
      { source: 'import', date: '2026-06-13', createdAt: new Date('2026-06-12T23:30:00Z') },
      TZ,
    ),
    false,
  )
})

test('import de 200 citas de junio: el sweep no cierra ninguna → ingresos no se mueven', () => {
  // Reproduce el caso del ticket: agenda de junio entera subida en agosto,
  // con precio real por cita. Los ingresos se calculan como
  // SUM(price) WHERE status='completed' (periodRevenueComponents), así que
  // "no se cierra ninguna" == "no suma ni un euro".
  const importedAt = new Date('2026-08-19T09:00:00Z')
  const PRICE_EUROS = 25
  const junio = Array.from({ length: 200 }, (_, i) => ({
    source: 'import',
    date: `2026-06-${String((i % 30) + 1).padStart(2, '0')}`,
    createdAt: importedAt,
    price: PRICE_EUROS,
  }))

  const cerradasPorElSweep = junio.filter((b) => !isBackfilledImport(b, TZ))
  const ingresosAnadidos = cerradasPorElSweep.reduce((sum, b) => sum + b.price, 0)

  assert.equal(cerradasPorElSweep.length, 0)
  assert.equal(ingresosAnadidos, 0)

  // Control: las mismas 200 citas creadas por el bot en su día SÍ las cierra
  // el sweep. Si esto falla, hemos roto la red de seguridad.
  const delBot = junio.map((b) => ({ ...b, source: 'bot' }))
  assert.equal(delBot.filter((b) => !isBackfilledImport(b, TZ)).length, 200)
})
