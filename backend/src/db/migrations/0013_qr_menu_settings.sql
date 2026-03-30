ALTER TABLE venues ADD COLUMN IF NOT EXISTS qr_menu_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
