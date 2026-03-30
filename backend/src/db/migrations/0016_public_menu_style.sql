ALTER TABLE venues ADD COLUMN IF NOT EXISTS public_menu_style varchar(32) NOT NULL DEFAULT 'gourmet';
