-- Remove duplicate menu rows that have zero ingredients when another row exists
-- for the same venue + name + category (category_id or legacy category) with ingredients.

DELETE FROM menu_items AS m
WHERE NOT EXISTS (
  SELECT 1 FROM product_ingredients pi WHERE pi.product_id = m.id
)
AND EXISTS (
  SELECT 1
  FROM menu_items m2
  WHERE m2.venue_id = m.venue_id
    AND m2.id <> m.id
    AND lower(trim(m2.name)) = lower(trim(m.name))
    AND (
      (m.category_id IS NOT NULL AND m2.category_id IS NOT DISTINCT FROM m.category_id)
      OR (
        m.category_id IS NULL
        AND m2.category_id IS NULL
        AND m2.category = m.category
      )
    )
    AND EXISTS (SELECT 1 FROM product_ingredients pi2 WHERE pi2.product_id = m2.id)
);
