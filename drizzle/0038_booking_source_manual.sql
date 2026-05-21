-- F3 Reni — Selector de origen al cierre de cita ("preguntale al cliente de
-- dónde te conoció y marca el chip"). OVERRIDE manual del barbero, opcional:
-- convive con la atribución pasiva (bookings.referrer_source / clients.first_source)
-- y la GANA cuando está set. Si null = queda la pasiva.
--
-- Valores cerrados (validación enum en TS, no en SQL):
--   'instagram' | 'tiktok' | 'facebook' | 'google_maps' | 'referral' | 'walk_in'
--
-- Aditivo. Sin defaults. Sin backfill (las citas históricas se quedan en null).
-- Reporting hace COALESCE(source_manual, derived_from_referrer).

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "source_manual" text;

-- Index parcial para acelerar el group-by en /informes (la mayoría de filas
-- son null mientras adoptamos la feature — no cubrir esas en el index).
CREATE INDEX IF NOT EXISTS "bookings_source_manual_client_date_idx"
  ON "bookings" ("client_id", "date", "source_manual")
  WHERE "source_manual" IS NOT NULL;
