-- Perfil de pago por barbero. Cinco piezas que combinan para calcular
-- la nómina mensual:
--   1. salary_base_cents       — salario fijo €/mes (asalariados)
--   2. commission_services_pct — % sobre servicios facturados por él
--   3. commission_products_pct — % sobre productos vendidos por él
--   4. chair_rent_cents        — alquiler de silla €/mes (autónomos, RESTA)
--   5. (bonos cobrados → vienen de la tabla bonuses ya existente)
--
-- salary_type: 'fijo' | 'mixto' | 'autonomo' — solo informativo, para
-- mostrar el preset elegido en UI. La nómina se calcula con los valores
-- numéricos, no con el tipo. Null = sin configurar (no sale en finanzas).
--
-- Las propinas SIEMPRE van íntegras al barbero que las recibió (decisión
-- de producto v1). No hay columna porque es la regla por defecto.

ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "salary_type" text;
ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "salary_base_cents" integer DEFAULT 0 NOT NULL;
ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "commission_services_pct" integer DEFAULT 0 NOT NULL;
ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "commission_products_pct" integer DEFAULT 0 NOT NULL;
ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "chair_rent_cents" integer DEFAULT 0 NOT NULL;
