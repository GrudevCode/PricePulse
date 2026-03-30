-- Allow deleting menu items when POS lines still reference them (historical tickets).
ALTER TABLE pos_ticket_items DROP CONSTRAINT IF EXISTS pos_ticket_items_menu_item_id_fkey;
ALTER TABLE pos_ticket_items
  ADD CONSTRAINT pos_ticket_items_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL;

-- When a menu product is deleted, remove its dish recipe so Recipe Calculator stays in sync.
ALTER TABLE dish_recipes DROP CONSTRAINT IF EXISTS dish_recipes_menu_item_id_fkey;
ALTER TABLE dish_recipes
  ADD CONSTRAINT dish_recipes_menu_item_id_fkey
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;
