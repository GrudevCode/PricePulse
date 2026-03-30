-- Restore the eight burger-menu inventory SKUs for Brown Bear after the gourmet seed wipe.
-- Unit costs follow the recipe screenshot (line cost ÷ quantity → per inventory unit).
-- Idempotent: skips rows that already exist for this venue + name + category.

INSERT INTO inventory_items (
  venue_id, name, category, on_hand, par_level, unit, unit_cost_pence, velocity_per_night, status
)
SELECT
  'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid,
  v.name,
  v.category,
  v.on_hand,
  v.par_level,
  v.unit,
  v.unit_cost_pence,
  0,
  'ok'
FROM (VALUES
  ('Burger patties', 'Prep', 30, 15, 'pc', 40),
  ('Bacon strips', 'Prep', 40, 20, 'pcs', 30),
  ('Cheese', 'Prep', 60, 30, 'pcs', 20),
  ('Lettuce', 'Prep', 8, 5, 'kg', 133),
  ('Onion', 'Prep', 5, 3, 'kg', 120),
  ('Fries', 'Prep', 10, 5, 'kg', 200),
  ('[Sub] Big Mac Sauce', 'Prep', 20, 10, 'portion', 40),
  ('Soft Drink', 'Bar', 48, 24, 'bottle', 250)
) AS v(name, category, on_hand, par_level, unit, unit_cost_pence)
WHERE EXISTS (
  SELECT 1 FROM venues WHERE id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
)
AND NOT EXISTS (
  SELECT 1
  FROM inventory_items i
  WHERE i.venue_id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
    AND i.name = v.name
    AND i.category = v.category
);

-- Re-attach rows that lost inventory_item_id when demo stock was deleted.
UPDATE product_ingredients pi
SET inventory_item_id = ii.id,
    updated_at = now()
FROM inventory_items ii
WHERE pi.venue_id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
  AND ii.venue_id = pi.venue_id
  AND pi.name = ii.name
  AND pi.inventory_item_id IS NULL;

UPDATE recipe_lines rl
SET inventory_item_id = ii.id,
    updated_at = now()
FROM inventory_items ii,
     dish_recipes dr
WHERE dr.id = rl.recipe_id
  AND dr.venue_id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
  AND ii.venue_id = dr.venue_id
  AND rl.ingredient_name = ii.name
  AND rl.inventory_item_id IS NULL
  AND rl.sub_recipe_id IS NULL;

UPDATE sub_recipe_lines srl
SET inventory_item_id = ii.id,
    updated_at = now()
FROM inventory_items ii,
     sub_recipes sr
WHERE sr.id = srl.sub_recipe_id
  AND sr.venue_id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
  AND ii.venue_id = sr.venue_id
  AND srl.ingredient_name = ii.name
  AND srl.inventory_item_id IS NULL;
