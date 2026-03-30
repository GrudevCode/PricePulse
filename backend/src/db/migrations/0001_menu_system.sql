-- Menu system migration
-- Adds: menus, menu_categories, product_ingredients
-- Updates: menu_items gets category_id FK

-- ─── Menus ────────────────────────────────────────────────────────────────────
-- Each venue can have multiple menus (e.g. "Monday–Saturday", "Sunday Special")

CREATE TABLE IF NOT EXISTS "menus" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id"      uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name"          varchar(255) NOT NULL,
  "description"   text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "menus_venue_id_idx" ON "menus"("venue_id");

-- ─── Menu Categories ──────────────────────────────────────────────────────────
-- Categories belong to a menu (e.g. "Food", "Wine", "Cocktails")

CREATE TABLE IF NOT EXISTS "menu_categories" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "menu_id"       uuid NOT NULL REFERENCES "menus"("id") ON DELETE CASCADE,
  "name"          varchar(255) NOT NULL,
  "description"   text,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "menu_categories_menu_id_idx" ON "menu_categories"("menu_id");

-- ─── Link menu_items → menu_categories ───────────────────────────────────────
-- Add nullable FK so existing rows are preserved; populate via data migration

ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "category_id" uuid REFERENCES "menu_categories"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "description"   text,
  ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "menu_items_category_id_idx" ON "menu_items"("category_id");

-- ─── Product Ingredients ──────────────────────────────────────────────────────
-- Each menu item (dish) can have multiple ingredients with quantities and costs

CREATE TABLE IF NOT EXISTS "product_ingredients" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id"    uuid NOT NULL REFERENCES "menu_items"("id") ON DELETE CASCADE,
  "name"          varchar(255) NOT NULL,
  "quantity"      decimal(10, 3) NOT NULL DEFAULT 0,
  "unit"          varchar(50) NOT NULL DEFAULT 'g',
  "cost_pence"    integer NOT NULL DEFAULT 0,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "product_ingredients_product_id_idx" ON "product_ingredients"("product_id");
