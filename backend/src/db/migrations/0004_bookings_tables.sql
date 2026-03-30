DO $$ BEGIN
  CREATE TYPE "booking_status" AS ENUM('confirmed', 'pending', 'seated', 'completed', 'cancelled', 'no-show');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "table_status" AS ENUM('available', 'occupied', 'reserved', 'cleaning');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "venue_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "number" varchar(50) NOT NULL,
  "section" varchar(100) NOT NULL,
  "capacity" integer NOT NULL DEFAULT 2,
  "shape" varchar(20) NOT NULL DEFAULT 'round',
  "x" integer NOT NULL DEFAULT 0,
  "y" integer NOT NULL DEFAULT 0,
  "w" integer,
  "h" integer,
  "status" "table_status" NOT NULL DEFAULT 'available',
  "color" varchar(7),
  "notes" text,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE("venue_id", "number")
);

CREATE INDEX IF NOT EXISTS "venue_tables_venue_id_idx" ON "venue_tables"("venue_id");

CREATE TABLE IF NOT EXISTS "table_bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "table_id" uuid REFERENCES "venue_tables"("id") ON DELETE SET NULL,
  "table_number" varchar(50) NOT NULL,
  "section" varchar(100) NOT NULL,
  "guest_name" varchar(255) NOT NULL,
  "party_size" integer NOT NULL DEFAULT 2,
  "booking_date" date NOT NULL,
  "start_time" varchar(5) NOT NULL,
  "duration" integer NOT NULL DEFAULT 90,
  "status" "booking_status" NOT NULL DEFAULT 'confirmed',
  "notes" text,
  "phone" varchar(50),
  "email" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "table_bookings_venue_id_idx" ON "table_bookings"("venue_id");
CREATE INDEX IF NOT EXISTS "table_bookings_table_id_idx" ON "table_bookings"("table_id");
CREATE INDEX IF NOT EXISTS "table_bookings_date_idx" ON "table_bookings"("booking_date");
CREATE INDEX IF NOT EXISTS "table_bookings_venue_date_idx" ON "table_bookings"("venue_id", "booking_date");

-- Demo floor plans and sample bookings were previously inserted here for every venue.
-- New accounts now start with no tables; users build layouts in Booking Editor and save to venue_tables.
