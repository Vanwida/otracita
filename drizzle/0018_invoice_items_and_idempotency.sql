-- Invoice items (1 factura → N líneas) + idempotencia de auto-facturación
-- de ventas de producto.
--
-- Hasta ahora la tabla `invoices` guardaba un único concepto (`service_name`
-- text) y un único total. Para reflejar productos vendidos durante una cita
-- en la misma factura del servicio, separamos las líneas en `invoice_items`.
--
-- `product_sales.invoiced_at` evita duplicar productos en futuras facturas
-- si el booking se reabre o un cron reintenta la emisión.

-- 1. Idempotencia ventas de producto.
ALTER TABLE "product_sales"
	ADD COLUMN IF NOT EXISTS "invoiced_at" timestamp with time zone;

-- 2. Tabla invoice_items.
CREATE TABLE IF NOT EXISTS "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"iva_amount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"product_sale_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_kind_valid" CHECK ("kind" IN ('service', 'product')),
	CONSTRAINT "invoice_items_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "invoice_items_amounts_nonnegative" CHECK (
		"unit_price_cents" >= 0
		AND "subtotal_cents" >= 0
		AND "iva_amount_cents" >= 0
		AND "total_cents" >= 0
	)
);

-- 3. FKs (idempotentes — DO blocks).
DO $$ BEGIN
	ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk"
		FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_sale_id_product_sales_id_fk"
		FOREIGN KEY ("product_sale_id") REFERENCES "public"."product_sales"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Índices.
-- Lookup por factura (PDF builder, libro mensual, drawer dashboard).
CREATE INDEX IF NOT EXISTS "invoice_items_invoice_idx"
	ON "invoice_items" ("invoice_id", "display_order");

-- Lookup inverso para idempotencia (¿esta venta ya se facturó?).
CREATE INDEX IF NOT EXISTS "invoice_items_product_sale_idx"
	ON "invoice_items" ("product_sale_id") WHERE "product_sale_id" IS NOT NULL;

-- Filtro recurrente de auto-facturación: ventas pendientes de facturar
-- ligadas a un booking concreto.
CREATE INDEX IF NOT EXISTS "product_sales_booking_uninvoiced_idx"
	ON "product_sales" ("booking_id") WHERE "invoiced_at" IS NULL AND "booking_id" IS NOT NULL;
