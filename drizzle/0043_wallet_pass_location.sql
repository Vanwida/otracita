-- Coordenadas del local para el Apple Wallet pass (geofence en lockscreen
-- iOS) y futuras features de mapa/distancia. Nullable: el pass omite la
-- sección de location si falta alguno. El barbero pega un Google Maps URL
-- en Ajustes → Negocio y el front parsea LAT,LNG antes de enviar.

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "latitude" double precision;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "longitude" double precision;
