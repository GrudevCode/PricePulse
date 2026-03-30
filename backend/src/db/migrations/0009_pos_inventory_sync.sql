-- ═══════════════════════════════════════════════════════════════════════════════
-- 0009: Schema for product_ingredients ↔ inventory POS pipeline + ticket columns
-- ═══════════════════════════════════════════════════════════════════════════════
-- Inventory rows and sections are created only via the app / API — no seed data here.
-- (Older versions of this file deleted all inventory_items per venue and inserted
--  demo gourmet stock; that destroyed user-entered ingredients on every migrate.)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Add missing columns to product_ingredients ──────────────────────────

ALTER TABLE "product_ingredients"
  ADD COLUMN IF NOT EXISTS "inventory_item_id" uuid REFERENCES "inventory_items"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "venue_id" uuid REFERENCES "venues"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "quantity_per_unit" decimal(10,3) DEFAULT 1;

CREATE INDEX IF NOT EXISTS "pi_inventory_item_idx" ON "product_ingredients"("inventory_item_id");
CREATE INDEX IF NOT EXISTS "pi_venue_id_idx" ON "product_ingredients"("venue_id");
CREATE INDEX IF NOT EXISTS "pi_menu_item_venue_idx" ON "product_ingredients"("product_id", "venue_id");

-- Back-fill venue_id from the parent menu_item
UPDATE "product_ingredients" pi
  SET venue_id = mi.venue_id
  FROM menu_items mi
  WHERE pi.product_id = mi.id AND pi.venue_id IS NULL;

-- Copy quantity → quantity_per_unit (used by deduction code)
UPDATE "product_ingredients"
  SET quantity_per_unit = COALESCE(quantity, 1)
  WHERE quantity_per_unit IS NULL OR quantity_per_unit = 1;

-- ─── 2. Add missing columns to pos_tickets ──────────────────────────────────

ALTER TABLE "pos_tickets"
  ADD COLUMN IF NOT EXISTS "inventory_deduction_ref" uuid,
  ADD COLUMN IF NOT EXISTS "inventory_deducted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ticket_type" varchar(20) DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS "booking_id" uuid REFERENCES "table_bookings"("id") ON DELETE SET NULL;

-- ─── 3. Add auto_close_on_full_payment to pos_config ─────────────────────────

ALTER TABLE "pos_config"
  ADD COLUMN IF NOT EXISTS "auto_close_on_full_payment" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "receipt_header" text,
  ADD COLUMN IF NOT EXISTS "receipt_footer" text,
  ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS "ticket_prefix" varchar(10) DEFAULT 'T';

-- ─── 4. Add staff_name to pos_sessions ────────────────────────────────────────

ALTER TABLE "pos_sessions"
  ADD COLUMN IF NOT EXISTS "staff_name" varchar(255);
