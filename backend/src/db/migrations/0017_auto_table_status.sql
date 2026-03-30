-- 0017_auto_table_status.sql
-- Adds per-table auto status mode and cleaning timer infrastructure

-- Per-table: toggle auto/manual status lifecycle
ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS auto_status boolean NOT NULL DEFAULT false;

-- Per-table: when cleaning started (for countdown timer)
ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS cleaning_started_at timestamptz;

-- Per-venue: cleaning timer duration in minutes (default 15)
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS cleaning_timer_minutes integer NOT NULL DEFAULT 15;
