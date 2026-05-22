-- Tracking pixels directos por cliente. Complementa GTM con inyección
-- directa de Meta/Google Ads/TikTok. Todos text nullable, validados en
-- server action antes de persistir. Consent Mode v2 aplicado en PWA.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "meta_pixel_id" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_ads_conversion_id" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "google_ads_conversion_label" text;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "tiktok_pixel_id" text;
