-- Migration 0011: Recipe & Profit Calculator tables
-- Stores dish recipes, recipe ingredient lines (linked to inventory), and reusable sub-recipes.

-- ─── Sub-recipes (reusable bases, sauces, doughs, etc.) ─────────────────────

CREATE TABLE IF NOT EXISTS sub_recipes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name          varchar(255) NOT NULL,
  yield_qty     decimal(10,3) NOT NULL DEFAULT 1,
  yield_unit    varchar(50)  NOT NULL DEFAULT 'portion',
  notes         text,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_recipes_venue_id_idx ON sub_recipes(venue_id);

-- ─── Sub-recipe ingredient lines ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_recipe_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_recipe_id     uuid NOT NULL REFERENCES sub_recipes(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  ingredient_name   varchar(255) NOT NULL,
  quantity          decimal(10,3) NOT NULL DEFAULT 0,
  unit              varchar(50)  NOT NULL DEFAULT 'g',
  cost_pence        integer      NOT NULL DEFAULT 0,
  waste_pct         decimal(5,2) NOT NULL DEFAULT 0,
  display_order     integer      NOT NULL DEFAULT 0,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_recipe_lines_sub_recipe_id_idx ON sub_recipe_lines(sub_recipe_id);

-- ─── Dish recipes (linked to menu items) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS dish_recipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  menu_item_id    uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  name            varchar(255) NOT NULL,
  portions        integer      NOT NULL DEFAULT 1,
  target_gp_pct   decimal(5,2) NOT NULL DEFAULT 70,
  vat_rate_pct    decimal(5,2) NOT NULL DEFAULT 20,
  notes           text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dish_recipes_venue_id_idx ON dish_recipes(venue_id);
CREATE INDEX IF NOT EXISTS dish_recipes_menu_item_id_idx ON dish_recipes(menu_item_id);

-- ─── Recipe ingredient lines ────────────────────────────────────────────────
-- Each line is EITHER an inventory item OR a sub-recipe (one of the two FKs is set)

CREATE TABLE IF NOT EXISTS recipe_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id         uuid NOT NULL REFERENCES dish_recipes(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  sub_recipe_id     uuid REFERENCES sub_recipes(id) ON DELETE SET NULL,
  ingredient_name   varchar(255) NOT NULL,
  quantity          decimal(10,3) NOT NULL DEFAULT 0,
  unit              varchar(50)  NOT NULL DEFAULT 'g',
  cost_pence        integer      NOT NULL DEFAULT 0,
  waste_pct         decimal(5,2) NOT NULL DEFAULT 0,
  display_order     integer      NOT NULL DEFAULT 0,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_lines_recipe_id_idx ON recipe_lines(recipe_id);
CREATE INDEX IF NOT EXISTS recipe_lines_inventory_item_id_idx ON recipe_lines(inventory_item_id);
CREATE INDEX IF NOT EXISTS recipe_lines_sub_recipe_id_idx ON recipe_lines(sub_recipe_id);
