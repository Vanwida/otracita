-- Productos vendidos por la barbería + ventas individuales (modelo manual,
-- el barbero registra cada venta desde el dashboard al cobrar).
--
-- products.stock_quantity NULL = ilimitado / no se trackea
-- product_sales.barber_id atribuye la venta para el desglose 'Por barbero'
-- en /dashboard/caja (columna Upsells)

CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"price_cents" integer NOT NULL,
	"stock_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("price_cents" > 0),
	CONSTRAINT "products_stock_nonnegative" CHECK ("stock_quantity" IS NULL OR "stock_quantity" >= 0)
);

CREATE TABLE IF NOT EXISTS "product_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"booking_id" uuid,
	"barber_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"customer_phone" text,
	"payment_method" text NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_sales_quantity_positive" CHECK ("quantity" > 0),
	CONSTRAINT "product_sales_payment_method_valid" CHECK ("payment_method" IN ('cash', 'card', 'online'))
);

DO $$ BEGIN
	ALTER TABLE "products" ADD CONSTRAINT "products_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_client_id_clients_id_fk"
		FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_product_id_products_id_fk"
		FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
	ALTER TABLE "product_sales" ADD CONSTRAINT "product_sales_booking_id_bookings_id_fk"
		FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index para listar productos del barbero por orden
CREATE INDEX IF NOT EXISTS "products_client_active_order_idx"
	ON "products" ("client_id", "active", "display_order");

-- Index para los queries de Upsells por barbero / periodo
CREATE INDEX IF NOT EXISTS "product_sales_client_sold_at_idx"
	ON "product_sales" ("client_id", "sold_at" DESC);

CREATE INDEX IF NOT EXISTS "product_sales_barber_idx"
	ON "product_sales" ("client_id", "barber_id") WHERE "barber_id" IS NOT NULL;
