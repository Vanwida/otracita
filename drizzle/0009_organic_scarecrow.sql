ALTER TABLE "barbers" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "barbers" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "public_slug" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "public_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "brand_logo_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "brand_cover_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "public_description" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tiktok_handle" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_public_slug_unique" UNIQUE("public_slug");--> statement-breakpoint

-- Backfill: auto-generate a URL-safe slug for every existing client from
-- their business_name. Lowercase, strip accents/punctuation, collapse
-- whitespace to hyphens, append a short hash of the id so two shops
-- named "Barbería Central" never collide. Idempotent — only runs where
-- the slug is still NULL.
UPDATE "clients" SET "public_slug" = (
  LOWER(
    REGEXP_REPLACE(
      TRANSLATE(
        COALESCE(NULLIF(TRIM("business_name"), ''), 'barberia'),
        'ÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãåéèëêíìïîóòöôõúùüûñçª°·/\\,.:;()!?¿¡"''`',
        'AAAAAAEEEEIIIIOOOOOUUUUNCaaaaaaeeeeiiiiooooouuuunc               '
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    )
  )
  || '-' || SUBSTRING(MD5("id"::text), 1, 6)
)
WHERE "public_slug" IS NULL;