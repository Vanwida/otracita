-- Perfil Booksy del empleado + asignación servicio↔barbero.
--
-- ADITIVA y idempotente (conv #5: el snapshot de drizzle-kit está
-- desincronizado en este proyecto, las migraciones se aplican lazy al
-- primer hit de código — guards IF NOT EXISTS / duplicate_object son la
-- red de seguridad, no el journal). Patrón: drizzle/0014_promos_contextuales.sql.
--
-- 1) barbers: 3 columnas de perfil (role / permission_level / online_bookable).
--    Defaults => filas existentes quedan reservables y como 'empleado'
--    (cero regresión).
-- 2) barber_services: qué servicios HACE cada barbero. SIN filas = hace
--    TODOS (no regresión: el motor de reservas v1 no filtra por servicio).

ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "permission_level" text DEFAULT 'empleado' NOT NULL;
ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "online_bookable" boolean DEFAULT true NOT NULL;

CREATE TABLE IF NOT EXISTS "barber_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barber_services_unique" UNIQUE("client_id","barber_id","service_name")
);

DO $$ BEGIN
	ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_barber_id_barbers_id_fk"
		FOREIGN KEY ("barber_id") REFERENCES "public"."barbers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lookup caliente: "¿qué servicios hace este barbero de este tenant?"
CREATE INDEX IF NOT EXISTS "barber_services_client_barber_idx"
	ON "barber_services" ("client_id", "barber_id");
