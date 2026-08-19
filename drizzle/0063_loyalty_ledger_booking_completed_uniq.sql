-- Fidelidad: el índice del que depende el ON CONFLICT del cron de awards.
--
-- `/api/cron/loyalty-award` inserta el sello con:
--
--   ON CONFLICT (booking_id) WHERE reason = 'booking_completed' DO NOTHING
--
-- Eso es INFERENCIA POR ÍNDICE: Postgres busca un índice UNIQUE sobre
-- (booking_id) cuyo predicado esté implicado por el WHERE del ON CONFLICT.
-- Ese índice nunca llegó al repo (ni schema.ts, ni migración, ni snapshot),
-- así que cada insert moría con 42P10 "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification", el catch del cron se lo
-- tragaba y el endpoint devolvía 200 con awarded=0. Cero sellos otorgados
-- desde junio. Esta migración crea el objeto que falta.
--
-- PARCIAL a propósito: sólo la fila del award automático es única por cita.
-- Los canjes ('redeem') y los ajustes manuales pueden repetir booking_id, o
-- traerlo a null, sin chocar con el award.
--
-- El predicado tiene que ser LITERALMENTE `reason = 'booking_completed'`,
-- el mismo que el del ON CONFLICT. Si se le añade algo (p.ej.
-- `AND booking_id IS NOT NULL`), Postgres deja de poder probar la implicación
-- y vuelve el 42P10. Hay un test que compara ambos: `award-idempotency.test.ts`.
--
-- Aditivo. Sin backfill: las citas que se quedaron sin sello estos meses no se
-- recuperan aquí (el cron sólo mira la ventana de 48h). Idempotente vía
-- IF NOT EXISTS — si en la DB viva ya existe el índice, este fichero es un
-- no-op y sólo sincroniza el repo.
--
-- Si la creación fallara por duplicados (no debería: el insert nunca llegó a
-- ejecutarse), inspeccionar antes de tocar nada — la ledger es append-only y
-- auditable:
--
--   SELECT booking_id, count(*) FROM loyalty_ledger
--   WHERE reason = 'booking_completed' AND booking_id IS NOT NULL
--   GROUP BY booking_id HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_ledger_booking_completed_uniq"
  ON "loyalty_ledger" ("booking_id")
  WHERE reason = 'booking_completed';
