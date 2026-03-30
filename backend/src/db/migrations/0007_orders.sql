DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('new', 'preparing', 'served', 'paid', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "table_number" varchar(50),
  "customer_name" varchar(255),
  "covers" integer NOT NULL DEFAULT 1,
  "status" order_status NOT NULL DEFAULT 'new',
  "total_pence" integer NOT NULL DEFAULT 0,
  "notes" text,
  "ordered_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "orders_venue_id_idx" ON "orders"("venue_id");
CREATE INDEX IF NOT EXISTS "orders_ordered_at_idx" ON "orders"("venue_id", "ordered_at");

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "qty" integer NOT NULL DEFAULT 1,
  "unit_price_pence" integer NOT NULL DEFAULT 0,
  "line_total_pence" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items"("order_id");

DO $$
DECLARE
  v RECORD;
  o1 uuid;
  o2 uuid;
BEGIN
  FOR v IN SELECT id FROM venues LOOP
    IF NOT EXISTS (SELECT 1 FROM orders WHERE venue_id = v.id) THEN
      INSERT INTO orders (venue_id, table_number, customer_name, covers, status, total_pence, notes, ordered_at)
      VALUES (v.id, '5', 'Walk-in', 2, 'served', 4250, 'Lunch set', now() - interval '2 hours')
      RETURNING id INTO o1;
      INSERT INTO order_items (order_id, name, qty, unit_price_pence, line_total_pence)
      VALUES
      (o1, 'Burger', 2, 1450, 2900),
      (o1, 'Fries', 1, 450, 450),
      (o1, 'Lager Pint', 2, 450, 900);

      INSERT INTO orders (venue_id, table_number, customer_name, covers, status, total_pence, notes, ordered_at)
      VALUES (v.id, 'B2', 'Alex', 1, 'new', 1250, 'No ice', now() - interval '20 minutes')
      RETURNING id INTO o2;
      INSERT INTO order_items (order_id, name, qty, unit_price_pence, line_total_pence)
      VALUES (o2, 'House Spritz', 1, 1250, 1250);
    END IF;
  END LOOP;
END $$;
