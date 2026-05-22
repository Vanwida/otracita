-- product_sales.consumption_kind
-- NULL = venta normal a cliente (con flujo de dinero)
-- 'internal' = consumo interno del barbero (decrementa stock, NO mueve dinero)
-- 'damage' = merma/rotura (decrementa stock, NO mueve dinero)
ALTER TABLE "product_sales" ADD COLUMN IF NOT EXISTS "consumption_kind" text;
