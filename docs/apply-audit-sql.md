# Aplicar el SQL del audit (rama `integrate/audit-ago19`)

Orden exacto para aplicar a Neon a mano con `psql`. **No uses
`drizzle-kit migrate`** aquí: el journal de este proyecto está desincronizado
con la DB real (ver `CLAUDE.md` §5) e intentaría reaplicar cosas viejas.

Las seis migraciones son **idempotentes** (`IF NOT EXISTS` en el DDL, `WHERE`
guardado en los `UPDATE`). Reejecutarlas no rompe nada.

## 0. Comprobar dónde estás

Las dos primeras son de la feature de reseñas de Google, que estaba en `main`
local sin pushear. Si ya las aplicaste en su día, sáltatelas — pero
comprobarlo cuesta una query:

```bash
psql "$DATABASE_URL" -c "
  SELECT
    to_regclass('public.google_reviews')                                    AS t_google_reviews,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name='clients' AND column_name='google_business_location_title') AS c_location_title,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name='clients' AND column_name='bot_gated_alert_at')      AS c_bot_gated,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_name='bookings' AND column_name='price_cents')            AS c_price_cents,
    to_regclass('public.loyalty_ledger_booking_completed_uniq')             AS i_loyalty_uniq;
"
```

Todo a `NULL` / `0` ⇒ no hay nada aplicado, corre los seis pasos.

## 1. Aplicar en este orden

Son independientes entre sí (tocan `clients`, `bookings`, `booking_services`
y `loyalty_ledger` sin pisarse), así que el orden numérico vale y no hay que
pensar.

```bash
# --- reseñas de Google (venían de main local, sin pushear) ---
psql "$DATABASE_URL" -f drizzle/0059_google_reviews.sql
psql "$DATABASE_URL" -f drizzle/0060_google_business_location_title.sql

# --- audit 19-ago ---
psql "$DATABASE_URL" -f drizzle/0061_default_db_availability.sql
psql "$DATABASE_URL" -f drizzle/0062_clients_bot_gated_alert_at.sql
psql "$DATABASE_URL" -f drizzle/0063_loyalty_ledger_booking_completed_uniq.sql
psql "$DATABASE_URL" -f drizzle/0064_booking_price_cents.sql
```

### Qué hace cada una

| Archivo | Hallazgo | Efecto |
|---|---|---|
| `0059_google_reviews.sql` | — | Tabla `google_reviews` + columnas OAuth de Google Business en `clients`. |
| `0060_google_business_location_title.sql` | — | `clients.google_business_location_title` (nombre legible de la ficha). |
| `0061_default_db_availability.sql` | **L-01** | `clients.use_db_availability` pasa a `DEFAULT true` **y se pone a true en TODOS los tenants existentes**, también los que tienen `google_calendar_id`. Sin esto, un alta por el wizard nace sin motor de disponibilidad y el bot no llega ni a ofrecer días. |
| `0062_clients_bot_gated_alert_at.sql` | **L-17** | `clients.bot_gated_alert_at` — cerrojo del aviso «una vez al día» cuando entran WhatsApps a una barbería con el bot gateado por plan. |
| `0063_loyalty_ledger_booking_completed_uniq.sql` | **L-04** | Índice UNIQUE parcial sobre `loyalty_ledger(booking_id) WHERE reason='booking_completed'`. Es el que necesita el `ON CONFLICT` del cron de fidelidad: sin él cada insert moría con 42P10 y el cron devolvía 200 con `awarded=0`. **Cero sellos otorgados desde junio.** |
| `0064_booking_price_cents.sql` | **L-05** | `price_cents` (INTEGER, céntimos) en `bookings` y `booking_services`, con backfill `valor_viejo * 100`. Las columnas viejas (`bookings.price`, `booking_services.price_euros`) **se dejan en pie** a propósito. |

### Ojo con el orden respecto al deploy

`0064` es la única con acoplamiento temporal real: **aplícala antes de que el
deploy nuevo esté sirviendo tráfico**. El código de esta rama lee y escribe
`price_cents`; si el deploy va primero, las reservas creadas en la ventana
intermedia revientan al insertar en una columna que aún no existe.

Las columnas viejas siguen ahí precisamente para que el camino contrario sea
seguro: el código antiguo puede seguir leyendo `price` durante la ventana de
despliegue sin ver nada raro.

## 2. Verificar

```bash
psql "$DATABASE_URL" -c "
  -- L-01: ningún tenant se queda sin motor de disponibilidad
  SELECT count(*) FILTER (WHERE NOT use_db_availability) AS tenants_sin_motor,
         count(*)                                        AS tenants_total
    FROM clients;
"

psql "$DATABASE_URL" -c "
  -- L-04: el índice existe y su predicado es EXACTAMENTE el del ON CONFLICT
  SELECT indexdef FROM pg_indexes
   WHERE indexname = 'loyalty_ledger_booking_completed_uniq';
"

psql "$DATABASE_URL" -c "
  -- L-05: backfill completo — no debe quedar ninguna fila con precio viejo
  -- y price_cents a null
  SELECT count(*) AS bookings_sin_backfill
    FROM bookings WHERE price IS NOT NULL AND price_cents IS NULL;
  SELECT count(*) AS servicios_sin_backfill
    FROM booking_services WHERE price_euros IS NOT NULL AND price_cents IS NULL;
"
```

Esperado: `tenants_sin_motor = 0`, el `indexdef` con
`WHERE (reason = 'booking_completed'::text)`, y los dos contadores de backfill
a `0`.

## 3. Limpieza posterior (NO ahora)

Cuando el deploy con `price_cents` lleve unos días asentado y no haya código
antiguo en circulación, se pueden tirar las columnas en euros. Es una
migración aparte, no la metas aquí:

```sql
ALTER TABLE bookings         DROP COLUMN price;
ALTER TABLE booking_services DROP COLUMN price_euros;
```
