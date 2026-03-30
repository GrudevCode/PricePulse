-- POS compatibility migration
-- Aligns existing DB columns with backend/src/routes/pos/index.ts expectations.

-- pos_config expected columns
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "default_tax_rate" decimal(5,2);
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "auto_close_on_full_payment" boolean DEFAULT true;
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "require_clock_in" boolean DEFAULT false;
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "receipt_header" text;
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "receipt_footer" text;
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'GBP';
ALTER TABLE "pos_config" ADD COLUMN IF NOT EXISTS "ticket_prefix" varchar(10) DEFAULT 'TK';

UPDATE "pos_config"
SET "default_tax_rate" = COALESCE("default_tax_rate", "tax_rate", 20.00);

-- pos_sessions expected columns
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "staff_name" varchar(255);
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "total_revenue_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "total_tax_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "total_service_charge_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "total_discount_pence" integer NOT NULL DEFAULT 0;
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "closing_notes" text;
ALTER TABLE "pos_sessions" ADD COLUMN IF NOT EXISTS "counted_cash_pence" integer;

UPDATE "pos_sessions"
SET "total_revenue_pence" = COALESCE("total_revenue_pence", "total_sales_pence", 0);

-- pos_tickets expected columns
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "ticket_ref" varchar(50);
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "ticket_type" varchar(20) DEFAULT 'dine_in';
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "void_reason" text;
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "voided_by" uuid REFERENCES "users"("id");
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "voided_at" timestamptz;
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "split_from_ticket_id" uuid REFERENCES "pos_tickets"("id");
ALTER TABLE "pos_tickets" ADD COLUMN IF NOT EXISTS "discount_reason" text;

UPDATE "pos_tickets"
SET "ticket_ref" = COALESCE("ticket_ref", 'TK-' || LPAD(CAST("ticket_number" AS text), 4, '0'));

-- inventory_items compatibility for POS deduction/menu stock checks
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "current_stock" integer;
UPDATE "inventory_items" SET "current_stock" = COALESCE("current_stock", "on_hand", 0);

-- product_ingredients compatibility fields expected by POS route
ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "menu_item_id" uuid REFERENCES "menu_items"("id") ON DELETE CASCADE;
ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "inventory_item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL;
ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "quantity_per_unit" decimal(10,3);
ALTER TABLE "product_ingredients" ADD COLUMN IF NOT EXISTS "venue_id" uuid REFERENCES "venues"("id") ON DELETE CASCADE;

UPDATE "product_ingredients"
SET
  "menu_item_id" = COALESCE("menu_item_id", "product_id"),
  "quantity_per_unit" = COALESCE("quantity_per_unit", "quantity"),
  "venue_id" = COALESCE("product_ingredients"."venue_id", mi."venue_id")
FROM "menu_items" mi
WHERE mi."id" = "product_ingredients"."product_id";

CREATE INDEX IF NOT EXISTS "product_ingredients_menu_item_id_idx" ON "product_ingredients"("menu_item_id");
CREATE INDEX IF NOT EXISTS "product_ingredients_venue_id_idx" ON "product_ingredients"("venue_id");

