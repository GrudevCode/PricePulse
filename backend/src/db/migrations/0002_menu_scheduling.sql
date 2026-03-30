-- Add schedule_json column to menus for drag-and-drop calendar scheduling
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS schedule_json jsonb NOT NULL DEFAULT '[]'::jsonb;
