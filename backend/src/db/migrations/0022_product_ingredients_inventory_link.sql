-- Add optional inventory item link to product_ingredients
-- When set, cost is auto-calculated from inventory unit price × quantity with unit conversion
ALTER TABLE product_ingredients
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_ingredients_inventory_item_id_idx
  ON product_ingredients (inventory_item_id);
