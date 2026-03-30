-- Intra-day menu switches per calendar date (HH:mm Europe/London → menu id), JSON array on existing row.
ALTER TABLE venue_schedule
ADD COLUMN IF NOT EXISTS time_switches jsonb NOT NULL DEFAULT '[]'::jsonb;
