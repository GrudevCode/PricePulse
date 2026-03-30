-- One-time: remove the demo floor + bookings that migration 0004 used to insert for every venue.
-- Only venues whose 20 table numbers match that legacy order (unchanged layout) are affected.

DELETE FROM table_bookings
WHERE venue_id IN (
  SELECT venue_id
  FROM venue_tables
  GROUP BY venue_id
  HAVING COUNT(*) = 20
    AND array_agg(number ORDER BY display_order) = ARRAY[
      '1','2','3','4','5','6','7','8',
      'B1','B2','B3','B4','B5',
      'P1','P2',
      'T1','T2','T3','T4','T5'
    ]::varchar[]
);

DELETE FROM venue_tables
WHERE venue_id IN (
  SELECT venue_id
  FROM venue_tables
  GROUP BY venue_id
  HAVING COUNT(*) = 20
    AND array_agg(number ORDER BY display_order) = ARRAY[
      '1','2','3','4','5','6','7','8',
      'B1','B2','B3','B4','B5',
      'P1','P2',
      'T1','T2','T3','T4','T5'
    ]::varchar[]
);
