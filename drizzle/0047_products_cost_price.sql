-- products.cost_price_cents
-- Coste de compra unitario (lo que le cuesta al local cada unidad, IVA incluido).
-- NULL = no configurado; el motor de P&L usa price_cents (precio venta) como
-- fallback conservador hasta que el jefe meta el coste real. Permite contabilizar
-- consumo interno / merma como gasto del periodo desde el día 1 sin pedir setup
-- previo. Nullable, default NULL — no rompe productos existentes.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost_price_cents" integer;
