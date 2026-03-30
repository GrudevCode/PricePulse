-- One-time: remove inventory left by old versions of migration 0009 (55-row gourmet demo stock).
-- product_ingredients / recipe_lines use ON DELETE SET NULL for inventory_item_id.
-- Only venues matching the historical fingerprint are touched — not blank slates or custom catalogs.

DO $$
DECLARE
  legacy_venue_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(venue_id), ARRAY[]::uuid[])
  INTO legacy_venue_ids
  FROM (
    SELECT venue_id
    FROM inventory_items
    GROUP BY venue_id
    HAVING COUNT(*) = 55
      AND array_agg(DISTINCT category ORDER BY category)
        = ARRAY['Bar', 'Cold Kitchen', 'Desserts', 'Hot Kitchen', 'Prep']::varchar[]
      AND SUM(CASE WHEN name IN (
        'Darjeeling Loose Leaf Tea',
        'Single-Origin Coffee Beans',
        'Laurent-Perrier Champagne',
        'House Lager 30L Keg',
        'Chalk Stream Trout',
        'Duck Livers',
        'House Red Wine',
        'Whole Milk',
        'Crème Fraîche',
        'Guinea Fowl (half)'
      ) THEN 1 ELSE 0 END) >= 3
  ) matched;

  IF cardinality(legacy_venue_ids) = 0 THEN
    RAISE NOTICE '0019: No legacy gourmet inventory fingerprint matched.';
    RETURN;
  END IF;

  DELETE FROM inventory_items WHERE venue_id = ANY (legacy_venue_ids);
  DELETE FROM inventory_sections WHERE venue_id = ANY (legacy_venue_ids);

  RAISE NOTICE '0019: Cleared legacy inventory + sections for % venue(s).', cardinality(legacy_venue_ids);
END $$;
