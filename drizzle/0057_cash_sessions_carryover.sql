-- Task #91: carryover del cierre de caja como apertura del día siguiente.
--
-- Hoy el barbero hace cierre con saldo en efectivo y al día siguiente la
-- apertura empieza desde 0 o desde un campo manual (foot-gun: si el cajón
-- tiene 145€ del cierre anterior, la apertura debería ser 145€).
--
-- Esta migración añade el modelo mínimo para arrastrar el saldo:
--
--   · opening_carried_from_session_id (uuid, FK self -> cash_sessions.id)
--     Apunta a la sesión cerrada cuyo `closing_cents_counted` se usó
--     como sugerencia de apertura. NULL = primera sesión del cliente o
--     el barbero introdujo el valor manualmente sin aceptar la sugerencia.
--     ON DELETE SET NULL para no perder histórico si en el futuro alguien
--     borra duro una sesión antigua (no es práctica habitual hoy).
--
--   · opening_carried_cents (integer, nullable)
--     Snapshot del valor SUGERIDO al momento de la apertura. Guardamos
--     este número aunque el barbero introduzca otro en `opening_cents`
--     — sirve para auditar discrepancias después ("la app sugirió 145€
--     pero el barbero abrió con 100€, motivo: 'retiré 45 al banco'").
--
--   · opening_manual_adjustment_reason (text, nullable)
--     Motivo libre cuando el barbero modifica el carryover sugerido. UI
--     lo pide cuando el valor introducido difiere del sugerido. Opcional
--     pero recomendado.
--
-- Las sesiones existentes (abiertas y cerradas) quedan con los tres
-- campos en NULL — no afecta a ningún cierre ya hecho. La UI/server
-- tratan NULL como "sin info de carryover" y caen al comportamiento
-- previo (apertura manual).

ALTER TABLE "cash_sessions"
	ADD COLUMN IF NOT EXISTS "opening_carried_from_session_id" uuid;

ALTER TABLE "cash_sessions"
	ADD COLUMN IF NOT EXISTS "opening_carried_cents" integer;

ALTER TABLE "cash_sessions"
	ADD COLUMN IF NOT EXISTS "opening_manual_adjustment_reason" text;

-- FK self con ON DELETE SET NULL, idempotente en redeploy.
DO $$ BEGIN
	ALTER TABLE "cash_sessions"
		ADD CONSTRAINT "cash_sessions_opening_carried_from_session_id_fk"
		FOREIGN KEY ("opening_carried_from_session_id")
		REFERENCES "public"."cash_sessions"("id")
		ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
