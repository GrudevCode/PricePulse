-- Full ingredient seed for all gourmet menu products
-- Costs in pence (wholesale/catering rates), quantities in recipe units

INSERT INTO product_ingredients (product_id, name, quantity, unit, cost_pence, display_order) VALUES

-- ══════════════════════════════════════════════════════════════════════════════
-- MONDAY TO FRIDAY — STARTERS
-- ══════════════════════════════════════════════════════════════════════════════

-- Duck Liver Parfait
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Duck Livers',          80,  'g',   150, 1),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Cognac',               20,  'ml',   35, 2),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Double Cream',         50,  'ml',   20, 3),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Brioche (sliced)',      60,  'g',    25, 4),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Fig Chutney',          30,  'g',    15, 5),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Cornichons',           20,  'g',    10, 6),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Unsalted Butter',      30,  'g',    22, 7),
('7ac54a11-43be-4653-a4d3-1dccc0a104f0', 'Shallots',             20,  'g',     8, 8),

-- Gazpacho Andalouse
('44ae321f-8432-4331-b0db-424499e0c1da', 'Heirloom Tomatoes',   300,  'g',    95, 1),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Cucumber',            100,  'g',    18, 2),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Red Pepper',           80,  'g',    30, 3),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Garlic',                5,  'g',     4, 4),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Sherry Vinegar',       15,  'ml',   12, 5),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Extra Virgin Olive Oil',20, 'ml',   22, 6),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Basil',                 5,  'g',    14, 7),
('44ae321f-8432-4331-b0db-424499e0c1da', 'Maldon Sea Salt',       2,  'g',     3, 8),

-- Burrata di Puglia
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Fresh Burrata',       125,  'g',   190, 1),
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Heritage Tomatoes',   180,  'g',    60, 2),
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Nocellara Olives',     40,  'g',    35, 3),
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Aged Balsamic',        15,  'ml',   55, 4),
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Focaccia',             60,  'g',    20, 5),
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Fresh Basil',           5,  'g',    14, 6),
('773dadef-4e9e-499a-86ac-7cb54dec7b84', 'Extra Virgin Olive Oil',10, 'ml',   11, 7),

-- ══════════════════════════════════════════════════════════════════════════════
-- MONDAY TO FRIDAY — MAINS
-- ══════════════════════════════════════════════════════════════════════════════

-- Roasted Guinea Fowl
('7de42875-d168-439e-bed7-ec750d783fc4', 'Guinea Fowl (half)',   380,  'g',   580, 1),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Maris Piper Potatoes',200,  'g',    28, 2),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Double Cream',        120,  'ml',   48, 3),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Mixed Wild Mushrooms',  80,  'g',   145, 4),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Thyme',                 3,  'g',     8, 5),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Chicken Stock',       200,  'ml',   50, 6),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Gruyère Cheese',       60,  'g',    85, 7),
('7de42875-d168-439e-bed7-ec750d783fc4', 'Unsalted Butter',      30,  'g',    22, 8),

-- Heritage Beetroot Wellington
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Heritage Beetroot',   250,  'g',    55, 1),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Puff Pastry',         120,  'g',    40, 2),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Goat''s Cheese',       80,  'g',   120, 3),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Walnut Pesto',         40,  'g',    65, 4),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Mixed Root Vegetables',200,  'g',    45, 5),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Red Wine',            100,  'ml',   50, 6),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Egg Wash',             20,  'g',     8, 7),
('222c935c-efdb-4930-882b-4a0c5aa983a2', 'Fresh Thyme',           3,  'g',     8, 8),

-- ══════════════════════════════════════════════════════════════════════════════
-- MONDAY TO FRIDAY — DESSERTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Crème Brûlée Classique
('9d699359-ba23-46e2-8381-5a9972d4a685', 'Double Cream',        200,  'ml',   80, 1),
('9d699359-ba23-46e2-8381-5a9972d4a685', 'Egg Yolks',            60,  'g',    22, 2),
('9d699359-ba23-46e2-8381-5a9972d4a685', 'Caster Sugar',         60,  'g',    12, 3),
('9d699359-ba23-46e2-8381-5a9972d4a685', 'Madagascan Vanilla Pod', 1, 'pc',   45, 4),
('9d699359-ba23-46e2-8381-5a9972d4a685', 'Orange Zest',           5,  'g',     5, 5),
('9d699359-ba23-46e2-8381-5a9972d4a685', 'Seasonal Berries',     40,  'g',    45, 6),

-- Lemon Tart Tatin
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Pâte Sablée',         80,  'g',    28, 1),
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Lemon Curd',          120,  'g',    35, 2),
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Egg Whites',           60,  'g',    15, 3),
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Caster Sugar',         80,  'g',    16, 4),
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Passion Fruit',         1,  'pc',   35, 5),
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Candied Lemon Zest',   10,  'g',    18, 6),
('abc549d5-e25b-4f49-9a73-7cb8fe14c435', 'Unsalted Butter',      30,  'g',    22, 7),

-- ══════════════════════════════════════════════════════════════════════════════
-- MONDAY TO FRIDAY — WINE BY THE GLASS
-- ══════════════════════════════════════════════════════════════════════════════

-- Pouilly-Fumé, Domaine Laporte (175ml pour from ~£22/btl)
('6530b848-1f33-48e4-95c1-4f8485afb6a4', 'Pouilly-Fumé Wine',   175,  'ml',  510, 1),
('6530b848-1f33-48e4-95c1-4f8485afb6a4', 'Wine Glass',            1,  'pc',   18, 2),

-- Mâcon-Villages, Louis Jadot (175ml from ~£14/btl)
('76e8fcc5-8b98-4b14-956a-17e87fd37e26', 'Mâcon Chardonnay',    175,  'ml',  325, 1),
('76e8fcc5-8b98-4b14-956a-17e87fd37e26', 'Wine Glass',            1,  'pc',   18, 2),

-- Château Greysac, Médoc (175ml from ~£18/btl)
('dd62a46a-51f3-4296-9f5a-ac02570ab4f3', 'Château Greysac',      175,  'ml',  420, 1),
('dd62a46a-51f3-4296-9f5a-ac02570ab4f3', 'Wine Glass',            1,  'pc',   18, 2),

-- Barolo, Marchesi di Barolo (175ml from ~£35/btl)
('2953bd43-aca4-45bc-8b8f-917255e18eab', 'Barolo Wine',          175,  'ml',  815, 1),
('2953bd43-aca4-45bc-8b8f-917255e18eab', 'Wine Glass',            1,  'pc',   18, 2),

-- ══════════════════════════════════════════════════════════════════════════════
-- MONDAY TO FRIDAY — COFFEE & TEA
-- ══════════════════════════════════════════════════════════════════════════════

-- Specialty Espresso
('8e5e8fde-7298-4b6d-85fc-c42c2d8372e5', 'Single-Origin Coffee Beans', 18, 'g',  72, 1),
('8e5e8fde-7298-4b6d-85fc-c42c2d8372e5', 'Filtered Water',       36,  'ml',    1, 2),

-- Flat White
('a233954e-5925-475e-8300-9952cc604adb', 'Coffee Beans',         18,  'g',    55, 1),
('a233954e-5925-475e-8300-9952cc604adb', 'Whole Milk',          120,  'ml',   12, 2),

-- Darjeeling First Flush
('51fbf958-0d5d-49fd-985e-91c6d433bdfa', 'Darjeeling Loose Leaf Tea', 4, 'g',  38, 1),
('51fbf958-0d5d-49fd-985e-91c6d433bdfa', 'Filtered Water',      300,  'ml',    2, 2),
('51fbf958-0d5d-49fd-985e-91c6d433bdfa', 'Raw Honey',             8,  'g',    10, 3),
('51fbf958-0d5d-49fd-985e-91c6d433bdfa', 'Lemon Slice',           1,  'pc',    4, 4),

-- Chamomile & Elderflower Infusion
('0489b417-e9d0-45e8-aec7-ddbc87732f65', 'Chamomile & Elderflower Tea', 4, 'g', 28, 1),
('0489b417-e9d0-45e8-aec7-ddbc87732f65', 'Filtered Water',      300,  'ml',    2, 2),
('0489b417-e9d0-45e8-aec7-ddbc87732f65', 'Wildflower Honey',      8,  'g',    12, 3),

-- ══════════════════════════════════════════════════════════════════════════════
-- SATURDAY — CANAPÉS
-- ══════════════════════════════════════════════════════════════════════════════

-- Smoked Salmon Blini (per piece)
('017a31d7-285b-4b8f-8f29-c0aac0527b06', 'Smoked Scottish Salmon', 15, 'g',   65, 1),
('017a31d7-285b-4b8f-8f29-c0aac0527b06', 'Buckwheat Blini',       1,  'pc',   15, 2),
('017a31d7-285b-4b8f-8f29-c0aac0527b06', 'Crème Fraîche',        10,  'g',    12, 3),
('017a31d7-285b-4b8f-8f29-c0aac0527b06', 'Oscietra Caviar',       2,  'g',   120, 4),
('017a31d7-285b-4b8f-8f29-c0aac0527b06', 'Chive',                 1,  'g',     4, 5),

-- Foie Gras Crostini (per piece)
('dc0ede53-e947-420f-b13a-2c8ebb329182', 'Foie Gras',            20,  'g',   175, 1),
('dc0ede53-e947-420f-b13a-2c8ebb329182', 'Pain de Campagne',     15,  'g',    10, 2),
('dc0ede53-e947-420f-b13a-2c8ebb329182', 'Sauternes Jelly',       8,  'g',    35, 3),
('dc0ede53-e947-420f-b13a-2c8ebb329182', 'Fleur de Sel',          1,  'g',     8, 4),

-- Truffle Arancini (per piece)
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Arborio Risotto Rice', 40,  'g',    18, 1),
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Black Truffle',         3,  'g',    95, 2),
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Parmesan',             15,  'g',    30, 3),
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Breadcrumbs',          20,  'g',     6, 4),
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Egg',                  25,  'g',    10, 5),
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Smoked Tomato Coulis', 20,  'ml',   12, 6),
('b28a48f6-ca45-4e04-9b64-53a42152c1b1', 'Sunflower Oil',        50,  'ml',    8, 7),

-- Canapé Selection (6 pieces — composite)
('0d89f89a-db26-41f3-a56a-ae680011cbef', 'Smoked Salmon Blini x2', 2, 'pc',  218, 1),
('0d89f89a-db26-41f3-a56a-ae680011cbef', 'Truffle Arancini x2',    2, 'pc',  358, 2),
('0d89f89a-db26-41f3-a56a-ae680011cbef', 'Seasonal Canapé x2',     2, 'pc',  180, 3),
('0d89f89a-db26-41f3-a56a-ae680011cbef', 'Serving Platter',        1, 'pc',   15, 4),
('0d89f89a-db26-41f3-a56a-ae680011cbef', 'Garnish & Microherbs',   5, 'g',    20, 5),

-- ══════════════════════════════════════════════════════════════════════════════
-- SATURDAY — STARTERS
-- ══════════════════════════════════════════════════════════════════════════════

-- Poached Native Lobster
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Native Lobster Tail',  150,  'g',   980, 1),
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Avocado',               80,  'g',    45, 2),
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Cucumber',              50,  'g',     9, 3),
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Lobster Bisque',       100,  'ml',   90, 4),
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Crème Fraîche',         40,  'g',    45, 5),
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Dill Oil',              10,  'ml',   25, 6),
('b7ba51fb-d081-49b7-afc8-a784608e802e', 'Lemon',                 10,  'g',     8, 7),

-- Foie Gras Terrine
('99609504-cae3-4391-956e-b034c6cfc9f4', 'Foie Gras',            120,  'g',  1050, 1),
('99609504-cae3-4391-956e-b034c6cfc9f4', 'Brioche Nanterre',      60,  'g',    30, 2),
('99609504-cae3-4391-956e-b034c6cfc9f4', 'Sauternes Gel',         30,  'g',    80, 3),
('99609504-cae3-4391-956e-b034c6cfc9f4', 'Bitter Orange',         15,  'g',    12, 4),
('99609504-cae3-4391-956e-b034c6cfc9f4', 'Roasted Hazelnuts',     20,  'g',    25, 5),
('99609504-cae3-4391-956e-b034c6cfc9f4', 'Fleur de Sel',           1,  'g',     8, 6),

-- Cured Chalk Stream Trout
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Chalk Stream Trout',   160,  'g',   480, 1),
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Horseradish Cream',     40,  'g',    35, 2),
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Granny Smith Apple',    50,  'g',    18, 3),
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Watercress',            25,  'g',    22, 4),
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Beetroot Crackers',     20,  'g',    18, 5),
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Dill',                   3,  'g',     9, 6),
('b3dcbb86-cf17-402f-8f84-48da3a567e26', 'Curing Salt',            5,  'g',     4, 7),

-- Wild Mushroom Velouté
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Mixed Wild Mushrooms',  200,  'g',   360, 1),
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Black Truffle',           5,  'g',   158, 2),
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Double Cream',          120,  'ml',   48, 3),
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Chicken Stock',         300,  'ml',   75, 4),
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Chestnut',               40,  'g',    30, 5),
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Sourdough Soldiers',     40,  'g',    15, 6),
('e95e8d94-8d69-4669-8eab-ad2cb3e1823b', 'Shallots',               30,  'g',    12, 7),

-- ══════════════════════════════════════════════════════════════════════════════
-- SATURDAY — MAINS
-- ══════════════════════════════════════════════════════════════════════════════

-- Whole Roasted Dover Sole
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Dover Sole (whole)',   500,  'g',  2200, 1),
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Unsalted Butter',       80,  'g',    60, 2),
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Capers',                20,  'g',    18, 3),
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Lemon',                 30,  'g',    15, 4),
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Flat-Leaf Parsley',      5,  'g',    10, 5),
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Heritage Potato',      180,  'g',    40, 6),
('6b95b6a5-a8c0-4d51-bb35-b07fc817ddde', 'Sunflower Oil',         20,  'ml',    6, 7),

-- Chateaubriand (per person)
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Beef Fillet (centre)',  300,  'g',  1980, 1),
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Béarnaise Sauce',       80,  'ml',   65, 2),
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Black Peppercorns',      5,  'g',    12, 3),
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Bone Marrow',           50,  'g',   150, 4),
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Truffle Fries',        150,  'g',   120, 5),
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Beef Stock',           150,  'ml',   55, 6),
('a5d8039d-a505-4022-a132-1bd6024fd899', 'Unsalted Butter',       30,  'g',    22, 7),

-- Slow-Braised Wagyu Short Rib
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Wagyu Short Rib',      350,  'g',  1850, 1),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Pomme Fondant',        200,  'g',    65, 2),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Chantenay Carrots',    100,  'g',    35, 3),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Red Wine',             200,  'ml',   90, 4),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Beef Stock',           300,  'ml',   85, 5),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Horseradish Gremolata', 15,  'g',    22, 6),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Bone Marrow',           30,  'g',    90, 7),
('56de1449-af2f-49c8-9a03-7a23f104f800', 'Fresh Thyme',            3,  'g',     8, 8),

-- Gnocchi à la Parisienne
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Gnocchi (house-made)', 200,  'g',    85, 1),
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Comté Cheese',          80,  'g',   145, 2),
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Wild Garlic Butter',    40,  'g',    55, 3),
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Périgord Truffle',       5,  'g',   158, 4),
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Pea Shoots',            15,  'g',    22, 5),
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Vegetable Stock',      100,  'ml',   20, 6),
('1e36096a-a6a7-4908-9fa8-cc25dcd669b7', 'Double Cream',          60,  'ml',   24, 7),

-- ══════════════════════════════════════════════════════════════════════════════
-- SATURDAY — DESSERTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Grand Cru Chocolate Marquise
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Amedei 72% Chocolate', 150,  'g',   420, 1),
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Unsalted Butter',      100,  'g',    75, 2),
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Eggs',                 100,  'g',    30, 3),
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Icing Sugar',           60,  'g',    10, 4),
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Raspberry Coulis',      50,  'ml',   35, 5),
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Almond Tuile',          10,  'g',    18, 6),
('02a4b0d0-a0cd-474d-bb78-790a510f277f', 'Edible Gold Dust',       0.2,'g',    25, 7),

-- Tarte Tatin Revisitée
('cbe4c6ed-83a2-4aec-bdbc-83fa05e3c29a', 'Granny Smith Apples',  200,  'g',    40, 1),
('cbe4c6ed-83a2-4aec-bdbc-83fa05e3c29a', 'Pâte Brisée',          80,  'g',    22, 2),
('cbe4c6ed-83a2-4aec-bdbc-83fa05e3c29a', 'Caster Sugar',          80,  'g',    16, 3),
('cbe4c6ed-83a2-4aec-bdbc-83fa05e3c29a', 'Unsalted Butter',       60,  'g',    45, 4),
('cbe4c6ed-83a2-4aec-bdbc-83fa05e3c29a', 'Calvados',              20,  'ml',   28, 5),
('cbe4c6ed-83a2-4aec-bdbc-83fa05e3c29a', 'Crème Fraîche Sorbet',  80,  'g',    65, 6),

-- Île Flottante
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Egg Whites',            80,  'g',    22, 1),
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Caster Sugar',         100,  'g',    20, 2),
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Whole Milk',           250,  'ml',   25, 3),
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Egg Yolks',             60,  'g',    22, 4),
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Praline',               30,  'g',    45, 5),
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Madagascan Vanilla',     1,  'pc',   45, 6),
('d2ac2a47-6395-4273-8e67-942d82a1f5ce', 'Kirsch Cherry',         15,  'g',    30, 7),

-- Artisan Cheese Trolley
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Montgomery Cheddar',    35,  'g',    45, 1),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Comté (24 month)',      35,  'g',    80, 2),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Roquefort',             35,  'g',    65, 3),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Brie de Meaux',         40,  'g',    55, 4),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Manchego',              35,  'g',    60, 5),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Quince Paste',          30,  'g',    22, 6),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Artisan Crackers',      30,  'g',    18, 7),
('f8ac6e20-24c7-4cfe-b0e7-7ebdd8c4772a', 'Honeycomb',             20,  'g',    35, 8),

-- ══════════════════════════════════════════════════════════════════════════════
-- SATURDAY — COCKTAILS
-- ══════════════════════════════════════════════════════════════════════════════

-- Radisson Bramble
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Hendrick''s Gin',       50,  'ml',  190, 1),
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Crème de Mûre',         20,  'ml',   65, 2),
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Fresh Lemon Juice',     25,  'ml',    8, 3),
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Simple Syrup',          15,  'ml',    5, 4),
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Fresh Blackberry',       3,  'pc',   12, 5),
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Rosemary Foam',         15,  'ml',   20, 6),
('5464eb71-efe7-4abd-acb2-bfe94b25654b', 'Ice',                  200,  'g',     3, 7),

-- Gold Rush
('f6495893-321f-4625-86cb-f040c504e872', 'Woodford Reserve Bourbon', 50, 'ml', 210, 1),
('f6495893-321f-4625-86cb-f040c504e872', 'Wildflower Honey Syrup', 25, 'ml',   18, 2),
('f6495893-321f-4625-86cb-f040c504e872', 'Fresh Lemon Juice',      25, 'ml',    8, 3),
('f6495893-321f-4625-86cb-f040c504e872', '24k Edible Gold Leaf',    0.1,'g',   22, 4),
('f6495893-321f-4625-86cb-f040c504e872', 'Ice',                   200, 'g',     3, 5),

-- Yuzu Sour
('4b5c10c4-bee0-433e-992d-77aee6e22e3a', 'Ketel One Vodka',       50,  'ml',  155, 1),
('4b5c10c4-bee0-433e-992d-77aee6e22e3a', 'Yuzu Liqueur',          25,  'ml',   95, 2),
('4b5c10c4-bee0-433e-992d-77aee6e22e3a', 'Fresh Lemon Juice',     20,  'ml',    6, 3),
('4b5c10c4-bee0-433e-992d-77aee6e22e3a', 'Egg White',             20,  'ml',    8, 4),
('4b5c10c4-bee0-433e-992d-77aee6e22e3a', 'Japanese Bitters',       2,  'ml',   10, 5),
('4b5c10c4-bee0-433e-992d-77aee6e22e3a', 'Ice',                  200,  'g',     3, 6),

-- Smoked Negroni
('b89e387c-8c25-4e8d-b8cc-5c9e9f945790', 'Monkey 47 Gin',         40,  'ml',  195, 1),
('b89e387c-8c25-4e8d-b8cc-5c9e9f945790', 'Campari',               40,  'ml',   80, 2),
('b89e387c-8c25-4e8d-b8cc-5c9e9f945790', 'Cocchi Vermouth di Torino', 40, 'ml', 90, 3),
('b89e387c-8c25-4e8d-b8cc-5c9e9f945790', 'Orange Peel',            5,  'g',    5, 4),
('b89e387c-8c25-4e8d-b8cc-5c9e9f945790', 'Smoking Wood Chips',     1,  'g',    8, 5),
('b89e387c-8c25-4e8d-b8cc-5c9e9f945790', 'Ice Sphere',             1,  'pc',  12, 6),

-- Kir Royale
('eecd7c6e-86dd-4e9b-9d9b-698324fe1426', 'Champagne (NV)',       100,  'ml',  295, 1),
('eecd7c6e-86dd-4e9b-9d9b-698324fe1426', 'Crème de Cassis (Dijon)', 25, 'ml', 55, 2),
('eecd7c6e-86dd-4e9b-9d9b-698324fe1426', 'Edible Gold Leaf',       0.1,'g',   22, 3),
('eecd7c6e-86dd-4e9b-9d9b-698324fe1426', 'Champagne Flute',        1,  'pc',  18, 4),

-- ══════════════════════════════════════════════════════════════════════════════
-- SATURDAY — CELLAR SELECTION
-- ══════════════════════════════════════════════════════════════════════════════

-- Chablis Grand Cru, William Fèvre 2021
('0e433df4-8727-4aad-b465-505a2a8eede1', 'Chablis Grand Cru (bottle)', 750, 'ml', 5200, 1),
('0e433df4-8727-4aad-b465-505a2a8eede1', 'Wine Glasses (×2)',    2,   'pc',   36, 2),
('0e433df4-8727-4aad-b465-505a2a8eede1', 'Ice Bucket Service',   1,   'pc',   20, 3),

-- Puligny-Montrachet, Domaine Leflaive 2020
('d81bae9e-0bb5-4104-b06e-83cccf3e875c', 'Puligny-Montrachet (bottle)', 750, 'ml', 8800, 1),
('d81bae9e-0bb5-4104-b06e-83cccf3e875c', 'Wine Glasses (×2)',    2,   'pc',   36, 2),
('d81bae9e-0bb5-4104-b06e-83cccf3e875c', 'Ice Bucket Service',   1,   'pc',   20, 3),

-- Château Léoville-Barton, Saint-Julien 2018
('052ad7ff-a648-4ca9-a746-ab83654a6a8a', 'Château Léoville-Barton (bottle)', 750, 'ml', 7600, 1),
('052ad7ff-a648-4ca9-a746-ab83654a6a8a', 'Wine Glasses (×2)',    2,   'pc',   36, 2),
('052ad7ff-a648-4ca9-a746-ab83654a6a8a', 'Decanter Service',     1,   'pc',   25, 3),

-- Barolo Riserva, Giacomo Conterno 2017
('717b7c55-05f4-46ca-9e14-8b5ea7562a97', 'Barolo Riserva (bottle)', 750, 'ml', 10200, 1),
('717b7c55-05f4-46ca-9e14-8b5ea7562a97', 'Wine Glasses (×2)',    2,   'pc',   36, 2),
('717b7c55-05f4-46ca-9e14-8b5ea7562a97', 'Decanter Service',     1,   'pc',   25, 3),

-- Moët & Chandon Grand Vintage 2015
('9484b0b1-a807-4cc8-95bd-f3e3e27ae671', 'Moët Grand Vintage (bottle)', 750, 'ml', 6800, 1),
('9484b0b1-a807-4cc8-95bd-f3e3e27ae671', 'Champagne Flutes (×2)', 2,  'pc',   36, 2),
('9484b0b1-a807-4cc8-95bd-f3e3e27ae671', 'Ice Bucket',            1,  'pc',   20, 3),

-- ══════════════════════════════════════════════════════════════════════════════
-- SUNDAY — BRUNCH
-- ══════════════════════════════════════════════════════════════════════════════

-- Eggs Benedict Royale
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'Smoked Scottish Salmon',  80,  'g',  345, 1),
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'Hen''s Eggs',             2,  'pc',   30, 2),
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'Hollandaise Sauce',      80,  'ml',   55, 3),
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'English Muffin',          1,  'pc',   18, 4),
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'Unsalted Butter',        20,  'g',    15, 5),
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'Chive',                   2,  'g',     6, 6),
('bd6610a0-f0e0-47b7-9076-c3d73583a6fd', 'Lemon Juice',            10,  'ml',    4, 7),

-- Truffle Scrambled Eggs
('c55bc659-59f2-4baa-9168-737026b99398', 'Free-Range Eggs',         3,  'pc',   45, 1),
('c55bc659-59f2-4baa-9168-737026b99398', 'Périgord Truffle',        4,  'g',   127, 2),
('c55bc659-59f2-4baa-9168-737026b99398', 'Comté Cheese',           30,  'g',    55, 3),
('c55bc659-59f2-4baa-9168-737026b99398', 'Sourdough Bread',        80,  'g',    22, 4),
('c55bc659-59f2-4baa-9168-737026b99398', 'Double Cream',           30,  'ml',   12, 5),
('c55bc659-59f2-4baa-9168-737026b99398', 'Unsalted Butter',        25,  'g',    19, 6),
('c55bc659-59f2-4baa-9168-737026b99398', 'Chive Oil',              10,  'ml',   15, 7),

-- Smoked Haddock Kedgeree
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Smoked Haddock',        180,  'g',   380, 1),
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Basmati Rice',          120,  'g',    28, 2),
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Boiled Egg',              1,  'pc',   15, 3),
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Curry Leaf Butter',      30,  'g',    35, 4),
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Curry Powder',            5,  'g',    10, 5),
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Flat-Leaf Parsley',       5,  'g',    10, 6),
('c2be2404-6b12-4fec-a5c2-b764e19ca14f', 'Onion',                  50,  'g',     8, 7),

-- Avocado & Burrata
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Ripe Avocado',           1,  'pc',   65, 1),
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Fresh Burrata',         125,  'g',  190, 2),
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Heritage Tomatoes',     100,  'g',   33, 3),
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Pumpkin Seeds',          15,  'g',   12, 4),
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Dried Chilli Flakes',    1,  'g',    4, 5),
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Sourdough',             80,  'g',   22, 6),
('7029d9b0-fe21-4a7a-bc91-921fafffb6d1', 'Extra Virgin Olive Oil', 10,  'ml',  11, 7),

-- Full Radisson Brunch
('be50de37-f46a-4210-becf-74a16fa5add9', 'Free-Range Back Bacon',   3,  'pc',   90, 1),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Gloucester Old Spot Sausage', 2, 'pc', 110, 2),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Black Pudding',           60,  'g',   35, 3),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Free-Range Eggs',          2,  'pc',  30, 4),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Grilled Tomato',           1,  'pc',  12, 5),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Homemade Hash Brown',      1,  'pc',  18, 6),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Sourdough Toast',         80,  'g',  22, 7),
('be50de37-f46a-4210-becf-74a16fa5add9', 'Baked Beans',            100,  'g',  18, 8),

-- ══════════════════════════════════════════════════════════════════════════════
-- SUNDAY — ROASTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Rack of Lamb
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Rack of Lamb (3 bones)', 280, 'g',  1180, 1),
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Rosemary',                 5,  'g',     8, 2),
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Garlic',                  10,  'g',     8, 3),
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Dauphinoise Potatoes',   180,  'g',    65, 4),
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Seasonal Vegetables',    150,  'g',    55, 5),
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Minted Gravy',           100,  'ml',   40, 6),
('8676f25b-788c-4c98-bee9-0c94c7412697', 'Yorkshire Pudding',       60,  'g',    20, 7),

-- Free-Range Chicken
('fc49cf2b-8430-466b-b9a6-7e538bb1e5b4', 'Free-Range Chicken (portion)', 350, 'g', 580, 1),
('fc49cf2b-8430-466b-b9a6-7e538bb1e5b4', 'Truffle Butter',          40,  'g',   180, 2),
('fc49cf2b-8430-466b-b9a6-7e538bb1e5b4', 'Roast Potatoes',         180,  'g',    50, 3),
('fc49cf2b-8430-466b-b9a6-7e538bb1e5b4', 'Seasonal Vegetables',    150,  'g',    55, 4),
('fc49cf2b-8430-466b-b9a6-7e538bb1e5b4', 'Chicken Jus',            100,  'ml',   55, 5),
('fc49cf2b-8430-466b-b9a6-7e538bb1e5b4', 'Yorkshire Pudding',       60,  'g',    20, 6),

-- Slow-Roasted Pork Belly
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Pork Belly',             320,  'g',   480, 1),
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Apple Sauce',             60,  'g',    20, 2),
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Dry Cider',              100,  'ml',   35, 3),
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Roast Potatoes',         180,  'g',    50, 4),
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Seasonal Vegetables',    150,  'g',    55, 5),
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Cider Jus',              100,  'ml',   45, 6),
('dc70b018-b67c-429e-92e4-25261878d8ac', 'Yorkshire Pudding',       60,  'g',    20, 7),

-- Celeriac & Wild Mushroom Roast (vegan)
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Celeriac',              300,  'g',    65, 1),
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Mixed Wild Mushrooms',  120,  'g',   215, 2),
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Puff Pastry',            80,  'g',    28, 3),
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Truffle Oil',             8,  'ml',  128, 4),
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Roast Potatoes',        180,  'g',    50, 5),
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Seasonal Vegetables',   150,  'g',    55, 6),
('c6c70397-12d3-4c49-a3e4-d64c0b8396a9', 'Vegetable Gravy',       100,  'ml',   30, 7),

-- ══════════════════════════════════════════════════════════════════════════════
-- SUNDAY — SIDES
-- ══════════════════════════════════════════════════════════════════════════════

-- Truffle & Parmesan Roast Potatoes
('26dfce21-0a24-48d1-904a-4a9c1cbeebba', 'Maris Piper Potatoes',  250,  'g',    35, 1),
('26dfce21-0a24-48d1-904a-4a9c1cbeebba', 'Goose Fat',              30,  'ml',   45, 2),
('26dfce21-0a24-48d1-904a-4a9c1cbeebba', 'Truffle Oil',             5,  'ml',   80, 3),
('26dfce21-0a24-48d1-904a-4a9c1cbeebba', 'Aged Parmesan',          20,  'g',    38, 4),
('26dfce21-0a24-48d1-904a-4a9c1cbeebba', 'Fresh Rosemary',          3,  'g',     7, 5),

-- Cauliflower Cheese
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Cauliflower',           300,  'g',    55, 1),
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Gruyère Cheese',         80,  'g',   115, 2),
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Whole Milk',            250,  'ml',   25, 3),
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Unsalted Butter',        30,  'g',    22, 4),
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Plain Flour',            25,  'g',     6, 5),
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Dijon Mustard',          10,  'g',    10, 6),
('b6a67870-c09a-4176-bc3c-d24195fa1f83', 'Panko Breadcrumbs',      20,  'g',     7, 7),

-- Honey-Glazed Chantenay Carrots
('69f6e105-c4ed-4fa4-9494-dafb5a26b7c2', 'Chantenay Carrots',     200,  'g',    38, 1),
('69f6e105-c4ed-4fa4-9494-dafb5a26b7c2', 'Wildflower Honey',       20,  'g',    25, 2),
('69f6e105-c4ed-4fa4-9494-dafb5a26b7c2', 'Unsalted Butter',        20,  'g',    15, 3),
('69f6e105-c4ed-4fa4-9494-dafb5a26b7c2', 'Fresh Thyme',             2,  'g',     5, 4),
('69f6e105-c4ed-4fa4-9494-dafb5a26b7c2', 'Maldon Sea Salt',         1,  'g',     3, 5),

-- Tenderstem Broccoli
('5ae2bfee-01fb-4b32-b4fa-5f498cc7e663', 'Tenderstem Broccoli',   200,  'g',    65, 1),
('5ae2bfee-01fb-4b32-b4fa-5f498cc7e663', 'Almond Butter',          25,  'g',    45, 2),
('5ae2bfee-01fb-4b32-b4fa-5f498cc7e663', 'Garlic',                  5,  'g',     4, 3),
('5ae2bfee-01fb-4b32-b4fa-5f498cc7e663', 'Dried Chilli',            1,  'g',     4, 4),
('5ae2bfee-01fb-4b32-b4fa-5f498cc7e663', 'Extra Virgin Olive Oil', 10,  'ml',   11, 5),

-- Dauphinoise Potatoes
('2f7f94f8-57cb-488c-a92e-245363ef9211', 'Maris Piper Potatoes',  250,  'g',    35, 1),
('2f7f94f8-57cb-488c-a92e-245363ef9211', 'Double Cream',          150,  'ml',   60, 2),
('2f7f94f8-57cb-488c-a92e-245363ef9211', 'Gruyère Cheese',         60,  'g',    85, 3),
('2f7f94f8-57cb-488c-a92e-245363ef9211', 'Fresh Thyme',             3,  'g',     7, 4),
('2f7f94f8-57cb-488c-a92e-245363ef9211', 'Garlic',                  5,  'g',     4, 5),
('2f7f94f8-57cb-488c-a92e-245363ef9211', 'Unsalted Butter',        20,  'g',    15, 6),

-- ══════════════════════════════════════════════════════════════════════════════
-- SUNDAY — DESSERTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Bakewell Tart
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Pâte Sablée',            80,  'g',    22, 1),
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Ground Almonds',          60,  'g',    38, 2),
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Unsalted Butter',         60,  'g',    45, 3),
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Eggs',                    60,  'g',    18, 4),
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Cherry Compote',          60,  'g',    35, 5),
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Crème Fraîche',           60,  'g',    35, 6),
('2259eee2-8bd9-42e7-bc59-dbc99a4619d4', 'Icing Sugar',             10,  'g',     3, 7),

-- Eton Mess
('7c88aed1-bf57-45dc-b5ca-76acffaadc68', 'Fresh Strawberries',     120,  'g',    65, 1),
('7c88aed1-bf57-45dc-b5ca-76acffaadc68', 'Double Cream',           100,  'ml',   40, 2),
('7c88aed1-bf57-45dc-b5ca-76acffaadc68', 'Rose Meringue',           50,  'g',    28, 3),
('7c88aed1-bf57-45dc-b5ca-76acffaadc68', 'Pistachios',              15,  'g',    38, 4),
('7c88aed1-bf57-45dc-b5ca-76acffaadc68', 'Icing Sugar',             10,  'g',     3, 5),
('7c88aed1-bf57-45dc-b5ca-76acffaadc68', 'Rosewater',               5,  'ml',    8, 6),

-- British Cheese Board
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Montgomery Cheddar',      40,  'g',    52, 1),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Stilton',                 35,  'g',    60, 2),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Brie de Meaux',           40,  'g',    55, 3),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Perl Wen',                35,  'g',    45, 4),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Smoked Applewood',        30,  'g',    38, 5),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Quince Paste',            30,  'g',    22, 6),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Oatcakes',                30,  'g',    12, 7),
('fd0af570-c194-47e7-a5bc-fa8b0bd34e17', 'Honeycomb',               20,  'g',    35, 8),

-- ══════════════════════════════════════════════════════════════════════════════
-- SUNDAY — CHAMPAGNE & SPARKLING
-- ══════════════════════════════════════════════════════════════════════════════

-- Laurent-Perrier La Cuvée (Glass 125ml) — ~£30/bottle → 500p/bottle → 83p/125ml
('203630f1-f0bb-42ea-91ed-5287df8346fa', 'Laurent-Perrier NV',    125,  'ml',  500, 1),
('203630f1-f0bb-42ea-91ed-5287df8346fa', 'Champagne Flute',         1,  'pc',   18, 2),

-- Laurent-Perrier La Cuvée (Bottle)
('0bf630f3-899f-45bd-9def-a1b8d3152f9a', 'Laurent-Perrier NV (btl)', 750, 'ml', 3000, 1),
('0bf630f3-899f-45bd-9def-a1b8d3152f9a', 'Champagne Flutes (×6)',  6,  'pc',  108, 2),
('0bf630f3-899f-45bd-9def-a1b8d3152f9a', 'Ice Bucket',             1,  'pc',   20, 3),

-- Ruinart Blanc de Blancs (Glass 125ml) — ~£60/bottle → 1250p/125ml
('c04fb642-ffb2-4f45-a52d-47d8faea7afd', 'Ruinart Blanc de Blancs', 125, 'ml', 1250, 1),
('c04fb642-ffb2-4f45-a52d-47d8faea7afd', 'Champagne Flute',          1,  'pc',   18, 2),

-- Nyetimber Classic Cuvée (Glass 125ml) — ~£35/bottle → 729p/125ml
('1900112c-4f6c-40ae-acbb-e31aaacbee16', 'Nyetimber Classic Cuvée', 125, 'ml',  729, 1),
('1900112c-4f6c-40ae-acbb-e31aaacbee16', 'Champagne Flute',           1, 'pc',   18, 2);
