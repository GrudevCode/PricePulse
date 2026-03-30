ALTER TABLE "pos_tickets"
  ADD COLUMN IF NOT EXISTS "booking_date" date,
  ADD COLUMN IF NOT EXISTS "booking_id" uuid REFERENCES "table_bookings"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "inventory_deducted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "inventory_deduction_ref" uuid REFERENCES "pos_payments"("id") ON DELETE SET NULL;

UPDATE "pos_tickets"
SET "booking_date" = COALESCE("booking_date", "created_at"::date)
WHERE "booking_date" IS NULL;

UPDATE "pos_tickets" t
SET "booking_id" = (
  SELECT tb.id
  FROM "table_bookings" tb
  WHERE tb."venue_id" = t."venue_id"
    AND tb."table_number" = t."table_number"
    AND tb."booking_date" = COALESCE(t."booking_date", t."created_at"::date)
    AND tb."status" <> 'cancelled'
    AND tb."status" <> 'no-show'
  ORDER BY tb."start_time" ASC, tb."created_at" ASC
  LIMIT 1
)
WHERE t."booking_id" IS NULL
  AND t."table_number" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "pos_tickets_venue_table_booking_date_idx"
  ON "pos_tickets"("venue_id", "table_number", "booking_date");

CREATE INDEX IF NOT EXISTS "pos_tickets_booking_id_idx"
  ON "pos_tickets"("booking_id");
