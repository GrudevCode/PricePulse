-- Fix typo in menu / recipe ingredient name so it matches inventory (Brown Bear).

UPDATE product_ingredients pi
SET name = 'Lettuce',
    inventory_item_id = ii.id,
    updated_at = now()
FROM inventory_items ii
WHERE pi.venue_id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
  AND ii.venue_id = pi.venue_id
  AND ii.name = 'Lettuce'
  AND pi.name = 'Lettice';

UPDATE recipe_lines rl
SET ingredient_name = 'Lettuce',
    inventory_item_id = ii.id,
    updated_at = now()
FROM inventory_items ii,
     dish_recipes dr
WHERE dr.id = rl.recipe_id
  AND dr.venue_id = 'e5f6d3f4-55ec-4f1a-9eb0-32e018901504'::uuid
  AND ii.venue_id = dr.venue_id
  AND ii.name = 'Lettuce'
  AND rl.ingredient_name = 'Lettice'
  AND rl.sub_recipe_id IS NULL;
