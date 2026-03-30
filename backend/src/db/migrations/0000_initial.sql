-- PricePulse initial schema migration

DO $$ BEGIN
  CREATE TYPE "pricing_mode" AS ENUM('auto', 'suggest', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "menu_provider" AS ENUM('square', 'toast', 'lightspeed', 'wix', 'custom_api', 'qr_only');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "pricing_decision_mode" AS ENUM('auto', 'suggested', 'manual_override');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" varchar(255) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "venues" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "address" text NOT NULL,
  "lat" decimal(10,7) NOT NULL,
  "lng" decimal(10,7) NOT NULL,
  "capacity" integer NOT NULL DEFAULT 100,
  "cuisine_type" varchar(100) NOT NULL DEFAULT 'bar',
  "base_price_multiplier" decimal(4,2) NOT NULL DEFAULT '1.00',
  "pricing_mode" "pricing_mode" NOT NULL DEFAULT 'suggest',
  "slug" varchar(100) NOT NULL UNIQUE,
  "brand_color" varchar(7),
  "competitor_notes" text,
  "current_occupancy_pct" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "venues_user_id_idx" ON "venues"("user_id");
CREATE INDEX IF NOT EXISTS "venues_slug_idx" ON "venues"("slug");

CREATE TABLE IF NOT EXISTS "menu_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "provider" "menu_provider" NOT NULL,
  "credentials_encrypted" jsonb,
  "last_sync_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "menu_integrations_venue_id_idx" ON "menu_integrations"("venue_id");

CREATE TABLE IF NOT EXISTS "menu_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "external_id" varchar(255),
  "name" varchar(255) NOT NULL,
  "category" varchar(100) NOT NULL DEFAULT 'Other',
  "base_price" integer NOT NULL,
  "current_price" integer NOT NULL,
  "is_dynamic_pricing_enabled" boolean NOT NULL DEFAULT true,
  "min_price" integer NOT NULL,
  "max_price" integer NOT NULL,
  "description" text,
  "image_url" text,
  "is_available" boolean NOT NULL DEFAULT true,
  "last_updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "menu_items_venue_id_idx" ON "menu_items"("venue_id");
CREATE INDEX IF NOT EXISTS "menu_items_category_idx" ON "menu_items"("venue_id", "category");

CREATE TABLE IF NOT EXISTS "signal_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "captured_at" timestamp DEFAULT now() NOT NULL,
  "time_of_day" varchar(8) NOT NULL,
  "day_of_week" varchar(10) NOT NULL,
  "is_public_holiday" boolean NOT NULL DEFAULT false,
  "weather_condition" varchar(20) NOT NULL DEFAULT 'clear',
  "temperature_c" decimal(5,2) NOT NULL DEFAULT '15',
  "precipitation_mm" decimal(5,2) NOT NULL DEFAULT '0',
  "period" varchar(20) NOT NULL DEFAULT 'afternoon',
  "nearby_events" jsonb NOT NULL DEFAULT '[]',
  "nearby_venues_open" jsonb NOT NULL DEFAULT '[]',
  "occupancy_pct" integer NOT NULL DEFAULT 0,
  "demand_score" integer NOT NULL DEFAULT 50,
  "raw_weather_data" jsonb,
  "stale_signals" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "signal_snapshots_venue_id_idx" ON "signal_snapshots"("venue_id");
CREATE INDEX IF NOT EXISTS "signal_snapshots_captured_at_idx" ON "signal_snapshots"("venue_id", "captured_at");

CREATE TABLE IF NOT EXISTS "pricing_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "decided_at" timestamp DEFAULT now() NOT NULL,
  "signals_snapshot" jsonb NOT NULL,
  "claude_reasoning" text NOT NULL,
  "recommended_multiplier" decimal(4,2) NOT NULL,
  "applied_multiplier" decimal(4,2),
  "items_updated" integer NOT NULL DEFAULT 0,
  "mode" "pricing_decision_mode" NOT NULL DEFAULT 'suggested',
  "recommendation" jsonb NOT NULL,
  "is_approved" boolean,
  "approved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pricing_decisions_venue_id_idx" ON "pricing_decisions"("venue_id");
CREATE INDEX IF NOT EXISTS "pricing_decisions_decided_at_idx" ON "pricing_decisions"("venue_id", "decided_at");
