-- Gourmet seed: Radisson Blu style — Monday-Friday, Saturday, Sunday
-- Venue: The Crown (4e62481d-a42d-4f7f-93bf-90ca9d81e298)

DO $$
DECLARE
  v  uuid := '4e62481d-a42d-4f7f-93bf-90ca9d81e298';

  -- ── Menu IDs ───────────────────────────────────────────────────────────────
  m_mf  uuid := gen_random_uuid();
  m_sat uuid := gen_random_uuid();
  m_sun uuid := gen_random_uuid();

  -- ── Monday-Friday category IDs ────────────────────────────────────────────
  mf_s   uuid := gen_random_uuid();  -- Starters
  mf_m   uuid := gen_random_uuid();  -- Mains
  mf_d   uuid := gen_random_uuid();  -- Desserts
  mf_w   uuid := gen_random_uuid();  -- Wine by the Glass
  mf_c   uuid := gen_random_uuid();  -- Coffee & Tea

  -- ── Saturday category IDs ────────────────────────────────────────────────
  sa_ca  uuid := gen_random_uuid();  -- Canapés
  sa_s   uuid := gen_random_uuid();  -- Starters
  sa_m   uuid := gen_random_uuid();  -- Mains
  sa_d   uuid := gen_random_uuid();  -- Desserts
  sa_ck  uuid := gen_random_uuid();  -- Cocktails
  sa_cl  uuid := gen_random_uuid();  -- Cellar Selection

  -- ── Sunday category IDs ──────────────────────────────────────────────────
  su_b   uuid := gen_random_uuid();  -- Brunch
  su_r   uuid := gen_random_uuid();  -- Sunday Roasts
  su_si  uuid := gen_random_uuid();  -- Sides
  su_d   uuid := gen_random_uuid();  -- Desserts
  su_sp  uuid := gen_random_uuid();  -- Champagne & Sparkling

  -- ── Key item IDs (for ingredient seeding) ────────────────────────────────
  it_scallops   uuid := gen_random_uuid();
  it_halibut    uuid := gen_random_uuid();
  it_beef_fillet uuid := gen_random_uuid();
  it_duck       uuid := gen_random_uuid();
  it_choc_fond  uuid := gen_random_uuid();
  it_ribeye     uuid := gen_random_uuid();
  it_duck_sat   uuid := gen_random_uuid();
  it_stickytof  uuid := gen_random_uuid();

BEGIN

  -- ══════════════════════════════════════════════════════════════════════════
  -- MENUS
  -- ══════════════════════════════════════════════════════════════════════════
  INSERT INTO menus (id, venue_id, name, description, is_active, display_order) VALUES
    (m_mf,  v, 'Monday to Friday', 'Contemporary European weekday lunch & dinner', true, 1),
    (m_sat, v, 'Saturday',         'Saturday evening à la carte & tasting plates',  true, 2),
    (m_sun, v, 'Sunday',           'Sunday brunch & traditional carved roasts',      true, 3);


  -- ══════════════════════════════════════════════════════════════════════════
  -- MONDAY TO FRIDAY
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO menu_categories (id, menu_id, name, description, display_order) VALUES
    (mf_s, m_mf, 'Starters',          'Light first courses',               1),
    (mf_m, m_mf, 'Mains',             'Signature dishes',                  2),
    (mf_d, m_mf, 'Desserts',          'Sweet conclusions',                  3),
    (mf_w, m_mf, 'Wine by the Glass', 'Sommelier curated selection',        4),
    (mf_c, m_mf, 'Coffee & Tea',      'Single origin & artisan infusions',  5);

  -- Starters
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (it_scallops,  v, 'Seared Scottish Scallops',    'Cauliflower purée, crispy pancetta, micro herbs, truffle oil',           'Starters', mf_s, 1800, 1800, 1500, 2300, true),
    (gen_random_uuid(), v, 'Duck Liver Parfait',       'Toasted brioche, fig chutney, cornichons, Maldon sea salt',              'Starters', mf_s, 1500, 1500, 1300, 1900, true),
    (gen_random_uuid(), v, 'Gazpacho Andalouse',       'Chilled heirloom tomato, basil oil, cucumber, sherry vinegar',           'Starters', mf_s, 1100, 1100,  900, 1400, true),
    (gen_random_uuid(), v, 'Burrata di Puglia',        'Heritage tomatoes, Nocellara olives, aged balsamic, focaccia crisp',     'Starters', mf_s, 1400, 1400, 1200, 1800, true);

  -- Mains
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (it_halibut,   v, 'Pan-Roasted Cornish Halibut',  'Saffron velouté, samphire, Jerusalem artichoke, lemon butter sauce',     'Mains', mf_m, 3400, 3400, 3000, 4200, true),
    (it_beef_fillet, v, '28-Day Aged Fillet of Beef', 'Pomme purée, wilted spinach, bone marrow jus, grilled asparagus',        'Mains', mf_m, 4200, 4200, 3800, 5200, true),
    (gen_random_uuid(), v, 'Roasted Guinea Fowl',      'Dauphinoise potato, confit leg, wild mushroom fricassée, thyme jus',     'Mains', mf_m, 3200, 3200, 2800, 4000, true),
    (gen_random_uuid(), v, 'Heritage Beetroot Wellington','Goat''s cheese, walnut pesto, roasted root vegetables, red wine reduction','Mains', mf_m, 2800, 2800, 2400, 3500, true);

  -- Desserts
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (it_choc_fond, v, 'Valrhona Chocolate Fondant',   'Salted caramel, Tonka bean ice cream, praline tuile',                    'Desserts', mf_d, 1400, 1400, 1200, 1700, true),
    (gen_random_uuid(), v, 'Crème Brûlée Classique',  'Madagascan vanilla, orange zest, seasonal berries',                     'Desserts', mf_d, 1200, 1200, 1000, 1500, true),
    (gen_random_uuid(), v, 'Lemon Tart Tatin',        'Italian meringue, passion fruit coulis, candied zest',                  'Desserts', mf_d, 1300, 1300, 1100, 1600, true);

  -- Wine by the Glass
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Pouilly-Fumé, Domaine Laporte',       'Loire Valley · mineral, grapefruit, citrus blossom · 175ml',         'Wine by the Glass', mf_w, 1400, 1400, 1200, 1700, true),
    (gen_random_uuid(), v, 'Mâcon-Villages, Louis Jadot',         'Burgundy · fresh Chardonnay, stone fruit, light oak · 175ml',        'Wine by the Glass', mf_w, 1100, 1100,  900, 1400, true),
    (gen_random_uuid(), v, 'Château Greysac, Médoc',              'Bordeaux · structured, blackcurrant, cedar · 175ml',                 'Wine by the Glass', mf_w, 1300, 1300, 1100, 1600, true),
    (gen_random_uuid(), v, 'Barolo, Marchesi di Barolo',          'Piedmont · bold, cherry, tar, violet · 175ml',                       'Wine by the Glass', mf_w, 1800, 1800, 1500, 2200, true);

  -- Coffee & Tea
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Specialty Espresso',              'Single-origin Ethiopian Yirgacheffe, 18g double',                'Coffee & Tea', mf_c, 450, 450, 400, 600, false),
    (gen_random_uuid(), v, 'Flat White',                      'Micro-foam whole milk, Guatemalan single-estate blend',          'Coffee & Tea', mf_c, 520, 520, 450, 650, false),
    (gen_random_uuid(), v, 'Darjeeling First Flush',          'Loose leaf, silver pot, raw honey & lemon',                     'Coffee & Tea', mf_c, 600, 600, 500, 750, false),
    (gen_random_uuid(), v, 'Chamomile & Elderflower Infusion','Organic loose leaf blend, wildflower honey',                    'Coffee & Tea', mf_c, 550, 550, 450, 700, false);


  -- ══════════════════════════════════════════════════════════════════════════
  -- SATURDAY
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO menu_categories (id, menu_id, name, description, display_order) VALUES
    (sa_ca, m_sat, 'Canapés',           'Amuse-bouche & pre-dinner bites',     1),
    (sa_s,  m_sat, 'Starters',          'À la carte first courses',             2),
    (sa_m,  m_sat, 'Mains',             'Saturday evening signatures',          3),
    (sa_d,  m_sat, 'Desserts',          'Pâtisserie & sweet plates',            4),
    (sa_ck, m_sat, 'Cocktails',         'Bar signatures & classics',            5),
    (sa_cl, m_sat, 'Cellar Selection',  'Sommelier curated bottles',            6);

  -- Canapés
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Smoked Salmon Blini',        'Crème fraîche, Oscietra caviar, chive · per piece',                  'Canapés', sa_ca,  650,  650,  550,  850, true),
    (gen_random_uuid(), v, 'Foie Gras Crostini',         'Sauternes jelly, fleur de sel, pain de campagne · per piece',       'Canapés', sa_ca,  750,  750,  650,  950, true),
    (gen_random_uuid(), v, 'Truffle Arancini',           'Black truffle, Parmesan, smoked tomato coulis · per piece',         'Canapés', sa_ca,  450,  450,  380,  580, true),
    (gen_random_uuid(), v, 'Canapé Selection (6 pieces)','Chef''s daily selection of smoked, cured & seasonal bites',        'Canapés', sa_ca, 2800, 2800, 2400, 3500, true);

  -- Starters
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Poached Native Lobster',     'Avocado mousse, pickled cucumber, bisque espuma, dill oil',          'Starters', sa_s, 2800, 2800, 2400, 3500, true),
    (gen_random_uuid(), v, 'Foie Gras Terrine',          'Brioche Nanterre, Sauternes gel, bitter orange, hazelnuts',          'Starters', sa_s, 2400, 2400, 2000, 3000, true),
    (gen_random_uuid(), v, 'Cured Chalk Stream Trout',   'Horseradish cream, apple, watercress, beetroot crackers',            'Starters', sa_s, 1900, 1900, 1600, 2400, true),
    (gen_random_uuid(), v, 'Wild Mushroom Velouté',      'Black truffle, chestnut foam, sourdough soldiers',                   'Starters', sa_s, 1600, 1600, 1400, 2000, true);

  -- Mains
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Whole Roasted Dover Sole',   'Brown butter, capers, lemon, parsley, heritage potato',              'Mains', sa_m, 5200, 5200, 4600, 6500, true),
    (gen_random_uuid(), v, 'Chateaubriand (per person)', 'Béarnaise, peppercorn jus, bone marrow, truffle fries',             'Mains', sa_m, 5800, 5800, 5200, 7200, true),
    (gen_random_uuid(), v, 'Slow-Braised Wagyu Short Rib','Pomme fondant, glazed carrots, Bordelaise, horseradish gremolata', 'Mains', sa_m, 4800, 4800, 4200, 6000, true),
    (it_duck_sat,        v, 'Pan-Seared Duck Breast',    'Confit leg croquette, cherry jus, celeriac purée, watercress',       'Mains', sa_m, 4000, 4000, 3500, 5000, true),
    (gen_random_uuid(), v, 'Gnocchi à la Parisienne',   'Comté gratin, wild garlic butter, Périgord truffle, pea shoots',    'Mains', sa_m, 3400, 3400, 3000, 4200, true);

  -- Desserts
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Grand Cru Chocolate Marquise','Amedei 72%, raspberry coulis, almond tuile, edible gold',          'Desserts', sa_d, 1800, 1800, 1500, 2200, true),
    (gen_random_uuid(), v, 'Tarte Tatin Revisitée',      'Granny Smith, calvados caramel, crème fraîche sorbet',              'Desserts', sa_d, 1600, 1600, 1400, 2000, true),
    (gen_random_uuid(), v, 'Île Flottante',              'Praline anglaise, spun sugar, kirsch-soaked cherry',                'Desserts', sa_d, 1500, 1500, 1300, 1900, true),
    (gen_random_uuid(), v, 'Artisan Cheese Trolley',     'Five British & Continental cheeses, quince, crackers, honeycomb',   'Desserts', sa_d, 2400, 2400, 2000, 3000, true);

  -- Cocktails
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Radisson Bramble',     'Hendrick''s gin, crème de mûre, lemon, blackberry, rosemary foam',        'Cocktails', sa_ck, 1650, 1650, 1400, 2100, true),
    (gen_random_uuid(), v, 'Gold Rush',            'Woodford Reserve bourbon, wildflower honey, lemon, 24k gold leaf',       'Cocktails', sa_ck, 1850, 1850, 1600, 2300, true),
    (gen_random_uuid(), v, 'Yuzu Sour',            'Ketel One vodka, yuzu liqueur, egg white, citrus, Japanese bitters',     'Cocktails', sa_ck, 1600, 1600, 1400, 2000, true),
    (gen_random_uuid(), v, 'Smoked Negroni',       'Monkey 47 gin, Campari, Cocchi Vermouth di Torino, orange peel',         'Cocktails', sa_ck, 1750, 1750, 1500, 2200, true),
    (gen_random_uuid(), v, 'Kir Royale',           'Champagne, Dijon blackcurrant liqueur, edible gold',                    'Cocktails', sa_ck, 1800, 1800, 1600, 2200, true);

  -- Cellar Selection
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Chablis Grand Cru, William Fèvre 2021',        'Burgundy · steely, oyster shell, white peach · 75cl',              'Cellar Selection', sa_cl,  9800,  9800,  9000, 12000, true),
    (gen_random_uuid(), v, 'Puligny-Montrachet, Domaine Leflaive 2020',    'Burgundy · complex, hazelnut, lemon curd, long finish · 75cl',     'Cellar Selection', sa_cl, 15500, 15500, 14000, 19000, true),
    (gen_random_uuid(), v, 'Château Léoville-Barton, Saint-Julien 2018',   'Bordeaux · cassis, graphite, cedar · 75cl',                        'Cellar Selection', sa_cl, 14200, 14200, 13000, 17500, true),
    (gen_random_uuid(), v, 'Barolo Riserva, Giacomo Conterno 2017',        'Piedmont · tar, roses, cherry, structured tannins · 75cl',         'Cellar Selection', sa_cl, 18600, 18600, 17000, 22000, true),
    (gen_random_uuid(), v, 'Moët & Chandon Grand Vintage 2015',            'Champagne · brioche, white fruit, lingering mousse · 75cl',        'Cellar Selection', sa_cl, 12000, 12000, 11000, 15000, true);


  -- ══════════════════════════════════════════════════════════════════════════
  -- SUNDAY
  -- ══════════════════════════════════════════════════════════════════════════

  INSERT INTO menu_categories (id, menu_id, name, description, display_order) VALUES
    (su_b,  m_sun, 'Brunch',                 'Morning & midday plates',                 1),
    (su_r,  m_sun, 'Sunday Roasts',          'Traditional roasts, carved at the table', 2),
    (su_si, m_sun, 'Sides',                  'Accompaniments & sharing plates',          3),
    (su_d,  m_sun, 'Desserts',               'Sunday puddings',                          4),
    (su_sp, m_sun, 'Champagne & Sparkling',  'Sunday bubbles',                           5);

  -- Brunch
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Eggs Benedict Royale',       'Smoked salmon, poached egg, hollandaise, muffin, chive',             'Brunch', su_b, 1800, 1800, 1600, 2200, true),
    (gen_random_uuid(), v, 'Truffle Scrambled Eggs',     'Périgord truffle, Comté, sourdough toast, chive oil',               'Brunch', su_b, 2200, 2200, 1900, 2700, true),
    (gen_random_uuid(), v, 'Smoked Haddock Kedgeree',    'Basmati rice, boiled egg, curry leaf butter, flat-leaf parsley',    'Brunch', su_b, 2000, 2000, 1800, 2500, true),
    (gen_random_uuid(), v, 'Avocado & Burrata',          'Heritage tomatoes, pumpkin seeds, chilli flakes, sourdough',        'Brunch', su_b, 1700, 1700, 1500, 2100, true),
    (gen_random_uuid(), v, 'Full Radisson Brunch',       'Free-range bacon, Gloucester sausage, black pudding, eggs, grilled tomato, hash brown', 'Brunch', su_b, 2800, 2800, 2400, 3500, true);

  -- Sunday Roasts
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (it_ribeye, v, 'Rib of Beef (28-Day Aged)',    'Yorkshire pudding, bone marrow gravy, horseradish cream, all trimmings',   'Sunday Roasts', su_r, 4800, 4800, 4200, 5900, true),
    (gen_random_uuid(), v, 'Rack of Lamb',          'Rosemary & garlic, minted gravy, dauphinoise, all trimmings',             'Sunday Roasts', su_r, 4400, 4400, 3900, 5400, true),
    (gen_random_uuid(), v, 'Free-Range Chicken',    'Stuffed with truffle butter, chicken jus, all trimmings',                 'Sunday Roasts', su_r, 3600, 3600, 3200, 4400, true),
    (gen_random_uuid(), v, 'Slow-Roasted Pork Belly','Crackling, apple sauce, cider jus, all trimmings',                      'Sunday Roasts', su_r, 3800, 3800, 3400, 4700, true),
    (gen_random_uuid(), v, 'Celeriac & Wild Mushroom Roast','Truffle gravy, all trimmings · plant-based',                      'Sunday Roasts', su_r, 3000, 3000, 2700, 3700, true);

  -- Sides
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Truffle & Parmesan Roast Potatoes','Goose fat, rosemary, aged Parmesan',                           'Sides', su_si, 700, 700, 600, 900, false),
    (gen_random_uuid(), v, 'Cauliflower Cheese',               'Gruyère, Dijon béchamel, panko crust',                        'Sides', su_si, 650, 650, 550, 800, false),
    (gen_random_uuid(), v, 'Honey-Glazed Chantenay Carrots',   'Thyme butter, Maldon sea salt',                               'Sides', su_si, 550, 550, 450, 700, false),
    (gen_random_uuid(), v, 'Tenderstem Broccoli',              'Almond butter, garlic, dried chilli',                         'Sides', su_si, 600, 600, 500, 750, false),
    (gen_random_uuid(), v, 'Dauphinoise Potatoes',             'Gruyère, thyme, double cream',                                'Sides', su_si, 700, 700, 600, 900, false);

  -- Sunday Desserts
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (it_stickytof, v, 'Sticky Toffee Pudding',    'Medjool date, salted butterscotch, clotted cream ice cream',               'Desserts', su_d, 1400, 1400, 1200, 1700, true),
    (gen_random_uuid(), v, 'Bakewell Tart',        'Frangipane, cherry compote, crème fraîche',                               'Desserts', su_d, 1300, 1300, 1100, 1600, true),
    (gen_random_uuid(), v, 'Eton Mess',            'Chantilly, strawberry, rose meringue, pistachios',                        'Desserts', su_d, 1200, 1200, 1000, 1500, true),
    (gen_random_uuid(), v, 'British Cheese Board', 'Montgomery Cheddar, Stilton, Brie de Meaux, quince, oatcakes',            'Desserts', su_d, 2200, 2200, 1900, 2700, true);

  -- Champagne & Sparkling
  INSERT INTO menu_items (id, venue_id, name, description, category, category_id, base_price, current_price, min_price, max_price, is_dynamic_pricing_enabled) VALUES
    (gen_random_uuid(), v, 'Laurent-Perrier La Cuvée (Glass)','Non-vintage · fresh, toasty, citrus · 125ml',                  'Champagne & Sparkling', su_sp,  1400,  1400,  1200,  1700, true),
    (gen_random_uuid(), v, 'Laurent-Perrier La Cuvée (Bottle)','Non-vintage · 75cl',                                         'Champagne & Sparkling', su_sp,  7800,  7800,  7200,  9500, true),
    (gen_random_uuid(), v, 'Ruinart Blanc de Blancs (Glass)', 'Delicate, creamy, white flowers · 125ml',                     'Champagne & Sparkling', su_sp,  2200,  2200,  1900,  2700, true),
    (gen_random_uuid(), v, 'Nyetimber Classic Cuvée (Glass)', 'English sparkling · apple, toasted almond, brioche · 125ml',  'Champagne & Sparkling', su_sp,  1600,  1600,  1400,  2000, true);


  -- ══════════════════════════════════════════════════════════════════════════
  -- INGREDIENTS (showcase dishes)
  -- ══════════════════════════════════════════════════════════════════════════

  -- Seared Scottish Scallops
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_scallops, 'King Scallops (3)',        180, 'g',  620, 1),
    (it_scallops, 'Cauliflower',              120, 'g',   45, 2),
    (it_scallops, 'Smoked Pancetta',           40, 'g',   90, 3),
    (it_scallops, 'Truffle Oil',                5, 'ml',  80, 4),
    (it_scallops, 'Double Cream',              60, 'ml',  25, 5),
    (it_scallops, 'Micro Herbs',                5, 'g',   30, 6),
    (it_scallops, 'Unsalted Butter',           20, 'g',   15, 7),
    (it_scallops, 'Lemon',                     10, 'g',    8, 8);

  -- Pan-Roasted Cornish Halibut
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_halibut, 'Halibut Fillet',            220, 'g',  980, 1),
    (it_halibut, 'Saffron',                    0.5,'g',  140, 2),
    (it_halibut, 'Fish Stock',                200, 'ml',  60, 3),
    (it_halibut, 'Samphire',                   40, 'g',   70, 4),
    (it_halibut, 'Jerusalem Artichoke',        80, 'g',   55, 5),
    (it_halibut, 'Double Cream',               80, 'ml',  30, 6),
    (it_halibut, 'Unsalted Butter',            30, 'g',   22, 7),
    (it_halibut, 'Lemon',                      15, 'g',   10, 8);

  -- 28-Day Aged Fillet of Beef
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_beef_fillet, 'Beef Fillet (28-day)',   250, 'g', 1650, 1),
    (it_beef_fillet, 'Pomme Purée',            180, 'g',   65, 2),
    (it_beef_fillet, 'Bone Marrow',             40, 'g',  120, 3),
    (it_beef_fillet, 'Asparagus',               80, 'g',   90, 4),
    (it_beef_fillet, 'Baby Spinach',            60, 'g',   25, 5),
    (it_beef_fillet, 'Red Wine',               100, 'ml',  55, 6),
    (it_beef_fillet, 'Beef Stock',             200, 'ml',  70, 7),
    (it_beef_fillet, 'Unsalted Butter',         25, 'g',   18, 8);

  -- Valrhona Chocolate Fondant
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_choc_fond, 'Valrhona 72% Chocolate', 120, 'g',  280, 1),
    (it_choc_fond, 'Unsalted Butter',          80, 'g',   60, 2),
    (it_choc_fond, 'Eggs',                    120, 'g',   35, 3),
    (it_choc_fond, 'Caster Sugar',             60, 'g',   12, 4),
    (it_choc_fond, 'Plain Flour',              30, 'g',    8, 5),
    (it_choc_fond, 'Tonka Bean Ice Cream',     80, 'g',  120, 6),
    (it_choc_fond, 'Salted Caramel Sauce',     40, 'ml',  45, 7),
    (it_choc_fond, 'Praline Tuile',            15, 'g',   35, 8);

  -- Pan-Seared Duck Breast (Saturday)
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_duck_sat, 'Duck Breast',              220, 'g',  680, 1),
    (it_duck_sat, 'Duck Confit Leg',           80, 'g',  290, 2),
    (it_duck_sat, 'Celeriac',                 150, 'g',   40, 3),
    (it_duck_sat, 'Cherries',                  60, 'g',   75, 4),
    (it_duck_sat, 'Port Wine',                 60, 'ml',  80, 5),
    (it_duck_sat, 'Chicken Stock',            200, 'ml',  50, 6),
    (it_duck_sat, 'Double Cream',              60, 'ml',  25, 7),
    (it_duck_sat, 'Watercress',                20, 'g',   18, 8);

  -- Rib of Beef (Sunday)
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_ribeye, 'Rib of Beef (28-day)',       350, 'g', 1850, 1),
    (it_ribeye, 'Bone Marrow',                 50, 'g',  130, 2),
    (it_ribeye, 'Yorkshire Pudding',           80, 'g',   35, 3),
    (it_ribeye, 'Horseradish Root',            30, 'g',   40, 4),
    (it_ribeye, 'Roast Potatoes',             200, 'g',   55, 5),
    (it_ribeye, 'Seasonal Vegetables',        150, 'g',   60, 6),
    (it_ribeye, 'Red Wine Gravy',             100, 'ml',  65, 7),
    (it_ribeye, 'Beef Dripping',               20, 'g',   25, 8);

  -- Sticky Toffee Pudding (Sunday)
  INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES
    (it_stickytof, 'Medjool Dates',           100, 'g',  145, 1),
    (it_stickytof, 'Plain Flour',              80, 'g',   12, 2),
    (it_stickytof, 'Dark Muscovado Sugar',     60, 'g',   18, 3),
    (it_stickytof, 'Unsalted Butter',          60, 'g',   45, 4),
    (it_stickytof, 'Eggs',                     80, 'g',   25, 5),
    (it_stickytof, 'Clotted Cream Ice Cream', 100, 'g',  120, 6),
    (it_stickytof, 'Butterscotch Sauce',       60, 'ml',  55, 7),
    (it_stickytof, 'Maldon Sea Salt',           1, 'g',    5, 8);

END $$;
