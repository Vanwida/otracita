-- Acceso del equipo — un solo PIN compartido + control de áreas visibles.
-- Modelo: el equipo es un equipo, confianza interna. El jefe oculta SOLO lo
-- sensible (finanzas, nóminas, comisiones, ajustes técnicos). UN solo PIN
-- compartido (4-6 dígitos), NO login por barbero, NO trazabilidad
-- individual. Si se va alguien → regenerar PIN.
--
-- `team_pin_hash` = hash scrypt (Node nativo, sin dep externa). Formato
-- guardado: "scrypt$N$r$p$saltHex$keyHex" — todos los parámetros viajan en
-- el propio string, así que se puede rehashear sin migración si subimos
-- coste futuro.
--
-- `team_allowed_areas` vacío → default "solo agenda" en la app (regla de
-- mínima sorpresa: activar acceso sin elegir áreas no expone nada más que
-- lo imprescindible para la jornada).

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "team_access_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "team_pin_hash" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "team_pin_updated_at" timestamp with time zone;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "team_allowed_areas" jsonb DEFAULT '[]'::jsonb;
