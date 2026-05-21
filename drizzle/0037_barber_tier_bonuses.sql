-- F1 — Compensación "asalariado base + tramos de bono por facturación".
--
-- Nuevo tipo de salario `salaried_with_tier_bonus` (4º preset): base mensual
-- garantizada + UN bono por tramo de facturación (el más alto alcanzado,
-- no acumulativo).
--
-- Ejemplo de tramos (editable por el dueño):
--   base 1.350 €/mes
--   facturó ≥ 4.000 € → +100 €
--   facturó ≥ 5.000 € → +250 €
--   facturó ≥ 6.000 € → +350 €
-- Si facturó 5.500 € → bono = 250 € (NO suma de los alcanzados).
--
-- Aditivo. salary_type sigue siendo text (no enum SQL) — la validación del
-- valor vive en TS. tier_bonuses es jsonb nullable: [{thresholdCents, bonusCents}].
-- null o [] ⇒ bono = 0 (efectivamente "asalariado puro").

ALTER TABLE "barbers" ADD COLUMN IF NOT EXISTS "tier_bonuses" jsonb;
