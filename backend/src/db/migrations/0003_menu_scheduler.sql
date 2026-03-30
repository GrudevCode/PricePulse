-- Add color field to menus
ALTER TABLE menus ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#6366f1';

-- Venue-level calendar schedule (one row per day)
CREATE TABLE IF NOT EXISTS venue_schedule (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  menu_id       UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(venue_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS venue_schedule_venue_id_idx ON venue_schedule(venue_id);
CREATE INDEX IF NOT EXISTS venue_schedule_date_idx     ON venue_schedule(schedule_date);
