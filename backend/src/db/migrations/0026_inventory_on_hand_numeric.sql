-- Allow fractional on_hand values so unit-converted deductions (e.g. 0.1 kg per pizza)
-- accumulate correctly instead of rounding back to the original integer.
-- NUMERIC(12, 4) supports up to 99,999,999 with 4 decimal places.
ALTER TABLE inventory_items
  ALTER COLUMN on_hand TYPE NUMERIC(12, 4) USING on_hand::numeric;

-- par_level stays INTEGER (par is always a whole-unit threshold)
-- velocity_per_night already allows fractional values in practice; leave as-is.
