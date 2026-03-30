CREATE TABLE IF NOT EXISTS "inventory_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inventory_sections_venue_id_idx" ON "inventory_sections"("venue_id");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_sections_venue_name_uidx" ON "inventory_sections"("venue_id", "name");

-- No default sections: users create sections from the app when needed.
