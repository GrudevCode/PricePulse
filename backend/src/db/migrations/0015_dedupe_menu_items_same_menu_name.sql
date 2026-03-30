-- Shadow rows from a second import: category_id IS NULL, no ingredients, same name as the
-- real row (category_id set, ingredients). Earlier dedupe required matching category_id so
-- these NULL-vs-set pairs were never removed.

DELETE FROM menu_items AS m
WHERE m.category_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.product_id = m.id)
  AND EXISTS (
    SELECT 1
    FROM menu_items m2
    WHERE m2.venue_id = m.venue_id
      AND m2.id <> m.id
      AND lower(trim(m2.name)) = lower(trim(m.name))
      AND EXISTS (SELECT 1 FROM product_ingredients pi2 WHERE pi2.product_id = m2.id)
  );
