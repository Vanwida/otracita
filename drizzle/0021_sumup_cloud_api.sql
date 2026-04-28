-- SumUp Cloud API — pivote de polling a push.
--
-- Quitamos el cursor de polling y añadimos los datos del Reader pareado
-- para iniciar cobros via Cloud API. El flow ahora es:
--   1. Barbero parea su Reader (sumup_reader_id, sumup_reader_name)
--   2. Pulsa "Cobrar" en otracita → POST a SumUp Cloud API
--   3. Reader pita, cliente paga
--   4. SumUp llama a nuestro return_url con el resultado
--   5. cash_movement se crea al instante

ALTER TABLE "clients"
	DROP COLUMN IF EXISTS "sumup_last_polled_at";

ALTER TABLE "clients"
	ADD COLUMN IF NOT EXISTS "sumup_reader_id" text,
	ADD COLUMN IF NOT EXISTS "sumup_reader_name" text;
