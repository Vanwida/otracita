-- Task #89: trazar qué barbero consume cada producto del stock.
--
-- product_sales.barber_id YA existía como columna nullable (migración 0017)
-- pero SIN constraint FK — solo "FK lógica" documentada en el schema. Esto
-- permitía que cualquier UUID se colase y dificultaba el control de gasto
-- por barbero (objetivo principal del task #89).
--
-- Esta migración:
--   1. Limpia (nullify) cualquier barber_id existente que NO apunte a un
--      barbero válido — pre-condición para crear la FK sin que falle.
--      Casos esperados de "huérfano": ninguno hoy (no hay borrado duro de
--      barbers en el flow), pero defensivo no cuesta nada.
--   2. Añade la FK real con ON DELETE SET NULL: si en el futuro alguien
--      borra duro un barber (vs soft-delete por active=false), la histórica
--      de consumos queda intacta — solo aparece como "Sin asignar".
--   3. NO toca filas con barber_id IS NULL (consumos pre-existentes sin
--      atribución) — las dejamos como están y la UI las muestra como
--      "Sin asignar". El control nuevo aplica solo a registros futuros.

-- 1) Defensa: nullificar barber_id huérfanos antes de crear la FK.
UPDATE "product_sales"
SET "barber_id" = NULL
WHERE "barber_id" IS NOT NULL
  AND "barber_id" NOT IN (SELECT "id" FROM "barbers");

-- 2) FK real con guard duplicate_object (idempotente en redeploy).
DO $$ BEGIN
	ALTER TABLE "product_sales"
		ADD CONSTRAINT "product_sales_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id")
		ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
