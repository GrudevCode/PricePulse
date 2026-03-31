-- Allow menu items to keep an image URL but optionally hide it from guest previews.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS display_image boolean NOT NULL DEFAULT true;
