CREATE TABLE IF NOT EXISTS "inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "category" varchar(100) NOT NULL,
  "on_hand" integer NOT NULL DEFAULT 0,
  "par_level" integer NOT NULL DEFAULT 0,
  "unit" varchar(100) NOT NULL,
  "unit_cost_pence" integer NOT NULL DEFAULT 0,
  "velocity_per_night" decimal(10,2) NOT NULL DEFAULT '0',
  "status" varchar(20) NOT NULL DEFAULT 'ok',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "inventory_items_venue_id_idx" ON "inventory_items"("venue_id");
CREATE INDEX IF NOT EXISTS "inventory_items_venue_category_idx" ON "inventory_items"("venue_id", "category");

-- No seed rows: inventory is populated from the Inventory Editor / API only.
