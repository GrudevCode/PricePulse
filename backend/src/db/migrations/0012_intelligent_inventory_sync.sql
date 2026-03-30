-- Per-product opt-in: when true, out-of-stock (from linked product_ingredients + inventory)
-- hides the dish from Menu Editor default list, menu preview, and public menu until restocked.

ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "intelligent_inventory_sync" boolean NOT NULL DEFAULT false;
