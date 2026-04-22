CREATE TABLE "barbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hours" jsonb,
	"blocked_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "barbers_client_name_unique" UNIQUE("client_id","name")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "barber_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "min_lead_time_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "max_booking_horizon_days" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "service_buffer_minutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill: seed `barbers` from existing clients.booksy_services jsonb, then
-- link existing bookings to those barber rows. Runs once in-migration so no
-- app data is left stranded after the schema change.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) One barber row per entry in each client's booksy_services array.
INSERT INTO "barbers" ("client_id", "name", "display_order", "active")
SELECT
  c.id,
  trim(elem.value->>'name'),
  (elem.ordinality - 1)::int,
  true
FROM "clients" c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE jsonb_typeof(c.booksy_services) WHEN 'array' THEN c.booksy_services ELSE '[]'::jsonb END
) WITH ORDINALITY AS elem(value, ordinality)
WHERE elem.value ? 'name'
  AND trim(elem.value->>'name') <> ''
ON CONFLICT ON CONSTRAINT "barbers_client_name_unique" DO NOTHING;--> statement-breakpoint

-- 2) Every client needs at least one barber. If the array was empty or
--    malformed, create a default using owner/business name.
INSERT INTO "barbers" ("client_id", "name", "display_order", "active")
SELECT
  c.id,
  COALESCE(NULLIF(trim(c.owner_name), ''), NULLIF(trim(c.business_name), ''), 'Barbero'),
  0,
  true
FROM "clients" c
WHERE NOT EXISTS (SELECT 1 FROM "barbers" b WHERE b.client_id = c.id)
ON CONFLICT ON CONSTRAINT "barbers_client_name_unique" DO NOTHING;--> statement-breakpoint

-- 3) Link bookings whose `barber` string matches a real barber name.
UPDATE "bookings" AS bk
SET "barber_id" = ba.id
FROM "barbers" AS ba
WHERE bk.client_id = ba.client_id
  AND bk.barber IS NOT NULL
  AND trim(bk.barber) = ba.name
  AND bk.barber_id IS NULL;--> statement-breakpoint

-- 4) Phantom bookings (barber NULL / empty / "Sin preferencia" / unmatched
--    name) → assign to the first active barber of that client. Without this
--    they sit invisible in the daily agenda grid because the column groups
--    by exact barber name.
UPDATE "bookings" AS bk
SET
  "barber_id" = b.id,
  "barber"    = b.name
FROM (
  SELECT DISTINCT ON (client_id) id, client_id, name
  FROM "barbers"
  WHERE active = true
  ORDER BY client_id, display_order ASC, created_at ASC
) AS b
WHERE bk.client_id = b.client_id
  AND bk.barber_id IS NULL;