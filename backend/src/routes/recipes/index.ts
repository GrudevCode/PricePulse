import { Router, Response } from 'express';
import { z } from 'zod';
import { getPool } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';

const router = Router({ mergeParams: true });

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const recipeLineSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  subRecipeId: z.string().uuid().nullable().optional(),
  ingredientName: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().min(1),
  costPence: z.number().int().min(0),
  wastePct: z.number().min(0).max(100).default(0),
  displayOrder: z.number().int().default(0),
});

const createRecipeSchema = z.object({
  menuItemId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  portions: z.number().int().min(1).default(1),
  targetGpPct: z.number().min(0).max(100).default(70),
  vatRatePct: z.number().min(0).max(100).default(20),
  notes: z.string().nullable().optional(),
  lines: z.array(recipeLineSchema).default([]),
});

const updateRecipeSchema = createRecipeSchema.partial();

const subRecipeLineSchema = z.object({
  inventoryItemId: z.string().uuid().nullable().optional(),
  ingredientName: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().min(1),
  costPence: z.number().int().min(0),
  wastePct: z.number().min(0).max(100).default(0),
  displayOrder: z.number().int().default(0),
});

const createSubRecipeSchema = z.object({
  name: z.string().min(1),
  yieldQty: z.number().min(0).default(1),
  yieldUnit: z.string().min(1).default('portion'),
  notes: z.string().nullable().optional(),
  lines: z.array(subRecipeLineSchema).default([]),
});

const updateSubRecipeSchema = createSubRecipeSchema.partial();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function venueId(req: AuthRequest) {
  return req.params.id;
}

// ─── Dish Recipes CRUD ───────────────────────────────────────────────────────

// List all recipes for venue
router.get('/recipes', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT r.*,
         COALESCE(json_agg(
           json_build_object(
             'id', rl.id,
             'inventoryItemId', rl.inventory_item_id,
             'subRecipeId', rl.sub_recipe_id,
             'ingredientName', rl.ingredient_name,
             'quantity', rl.quantity::float,
             'unit', rl.unit,
             'costPence', rl.cost_pence,
             'wastePct', rl.waste_pct::float,
             'displayOrder', rl.display_order
           ) ORDER BY rl.display_order
         ) FILTER (WHERE rl.id IS NOT NULL), '[]') AS lines
       FROM dish_recipes r
       LEFT JOIN recipe_lines rl ON rl.recipe_id = r.id
       WHERE r.venue_id = $1
       GROUP BY r.id
       ORDER BY r.name`,
      [venueId(req)],
    );
    const data = rows.map((r) => ({
      id: r.id,
      venueId: r.venue_id,
      menuItemId: r.menu_item_id,
      name: r.name,
      portions: r.portions,
      targetGpPct: parseFloat(r.target_gp_pct),
      vatRatePct: parseFloat(r.vat_rate_pct),
      notes: r.notes,
      lines: r.lines,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Recipes] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch recipes' });
  }
});

// ─── Sub-Recipes CRUD (must be before /recipes/:recipeId to avoid param clash) ─

// List sub-recipes
router.get('/recipes/sub-recipes', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT sr.*,
         COALESCE(json_agg(
           json_build_object(
             'id', srl.id,
             'inventoryItemId', srl.inventory_item_id,
             'ingredientName', srl.ingredient_name,
             'quantity', srl.quantity::float,
             'unit', srl.unit,
             'costPence', srl.cost_pence,
             'wastePct', srl.waste_pct::float,
             'displayOrder', srl.display_order
           ) ORDER BY srl.display_order
         ) FILTER (WHERE srl.id IS NOT NULL), '[]') AS lines
       FROM sub_recipes sr
       LEFT JOIN sub_recipe_lines srl ON srl.sub_recipe_id = sr.id
       WHERE sr.venue_id = $1
       GROUP BY sr.id
       ORDER BY sr.name`,
      [venueId(req)],
    );
    const data = rows.map((r) => ({
      id: r.id, venueId: r.venue_id, name: r.name,
      yieldQty: parseFloat(r.yield_qty), yieldUnit: r.yield_unit,
      notes: r.notes, lines: r.lines,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[SubRecipes] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch sub-recipes' });
  }
});

// Create sub-recipe
router.post('/recipes/sub-recipes', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createSubRecipeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const { name, yieldQty, yieldUnit, notes, lines } = parsed.data;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [sr] } = await client.query(
        `INSERT INTO sub_recipes (venue_id, name, yield_qty, yield_unit, notes)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [venueId(req), name, yieldQty, yieldUnit, notes ?? null],
      );
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await client.query(
          `INSERT INTO sub_recipe_lines (sub_recipe_id, inventory_item_id, ingredient_name, quantity, unit, cost_pence, waste_pct, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sr.id, l.inventoryItemId ?? null, l.ingredientName, l.quantity, l.unit, l.costPence, l.wastePct, i],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: { id: sr.id } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[SubRecipes] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create sub-recipe' });
  }
});

// Update sub-recipe
router.put('/recipes/sub-recipes/:subRecipeId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateSubRecipeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (parsed.data.name !== undefined)      { sets.push(`name = $${idx++}`);       vals.push(parsed.data.name); }
      if (parsed.data.yieldQty !== undefined)  { sets.push(`yield_qty = $${idx++}`);  vals.push(parsed.data.yieldQty); }
      if (parsed.data.yieldUnit !== undefined) { sets.push(`yield_unit = $${idx++}`); vals.push(parsed.data.yieldUnit); }
      if (parsed.data.notes !== undefined)     { sets.push(`notes = $${idx++}`);      vals.push(parsed.data.notes); }
      sets.push(`updated_at = now()`);
      await client.query(
        `UPDATE sub_recipes SET ${sets.join(', ')} WHERE id = $${idx} AND venue_id = $${idx + 1}`,
        [...vals, req.params.subRecipeId, venueId(req)],
      );
      if (parsed.data.lines !== undefined) {
        await client.query(`DELETE FROM sub_recipe_lines WHERE sub_recipe_id = $1`, [req.params.subRecipeId]);
        for (let i = 0; i < parsed.data.lines.length; i++) {
          const l = parsed.data.lines[i];
          await client.query(
            `INSERT INTO sub_recipe_lines (sub_recipe_id, inventory_item_id, ingredient_name, quantity, unit, cost_pence, waste_pct, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [req.params.subRecipeId, l.inventoryItemId ?? null, l.ingredientName, l.quantity, l.unit, l.costPence, l.wastePct, i],
          );
        }
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[SubRecipes] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update sub-recipe' });
  }
});

// Delete sub-recipe
router.delete('/recipes/sub-recipes/:subRecipeId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    await pool.query(`DELETE FROM sub_recipes WHERE id = $1 AND venue_id = $2`, [req.params.subRecipeId, venueId(req)]);
    res.json({ success: true });
  } catch (err) {
    console.error('[SubRecipes] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete sub-recipe' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// Get single recipe
router.get('/recipes/:recipeId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT r.*,
         COALESCE(json_agg(
           json_build_object(
             'id', rl.id,
             'inventoryItemId', rl.inventory_item_id,
             'subRecipeId', rl.sub_recipe_id,
             'ingredientName', rl.ingredient_name,
             'quantity', rl.quantity::float,
             'unit', rl.unit,
             'costPence', rl.cost_pence,
             'wastePct', rl.waste_pct::float,
             'displayOrder', rl.display_order
           ) ORDER BY rl.display_order
         ) FILTER (WHERE rl.id IS NOT NULL), '[]') AS lines
       FROM dish_recipes r
       LEFT JOIN recipe_lines rl ON rl.recipe_id = r.id
       WHERE r.id = $1 AND r.venue_id = $2
       GROUP BY r.id`,
      [req.params.recipeId, venueId(req)],
    );
    if (!rows.length) { res.status(404).json({ success: false, error: 'Recipe not found' }); return; }
    const r = rows[0];
    res.json({
      success: true,
      data: {
        id: r.id, venueId: r.venue_id, menuItemId: r.menu_item_id, name: r.name,
        portions: r.portions, targetGpPct: parseFloat(r.target_gp_pct),
        vatRatePct: parseFloat(r.vat_rate_pct), notes: r.notes, lines: r.lines,
        createdAt: r.created_at, updatedAt: r.updated_at,
      },
    });
  } catch (err) {
    console.error('[Recipes] Get error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch recipe' });
  }
});

// Create recipe
router.post('/recipes', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createRecipeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const { name, menuItemId, portions, targetGpPct, vatRatePct, notes, lines } = parsed.data;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [recipe] } = await client.query(
        `INSERT INTO dish_recipes (venue_id, menu_item_id, name, portions, target_gp_pct, vat_rate_pct, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [venueId(req), menuItemId ?? null, name, portions, targetGpPct, vatRatePct, notes ?? null],
      );
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await client.query(
          `INSERT INTO recipe_lines (recipe_id, inventory_item_id, sub_recipe_id, ingredient_name, quantity, unit, cost_pence, waste_pct, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [recipe.id, l.inventoryItemId ?? null, l.subRecipeId ?? null, l.ingredientName, l.quantity, l.unit, l.costPence, l.wastePct, i],
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: { id: recipe.id } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Recipes] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create recipe' });
  }
});

// Update recipe (full replace of lines)
router.put('/recipes/:recipeId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateRecipeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sets: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (parsed.data.name !== undefined)        { sets.push(`name = $${idx++}`);           vals.push(parsed.data.name); }
      if (parsed.data.menuItemId !== undefined)   { sets.push(`menu_item_id = $${idx++}`);   vals.push(parsed.data.menuItemId); }
      if (parsed.data.portions !== undefined)     { sets.push(`portions = $${idx++}`);       vals.push(parsed.data.portions); }
      if (parsed.data.targetGpPct !== undefined)  { sets.push(`target_gp_pct = $${idx++}`);  vals.push(parsed.data.targetGpPct); }
      if (parsed.data.vatRatePct !== undefined)   { sets.push(`vat_rate_pct = $${idx++}`);   vals.push(parsed.data.vatRatePct); }
      if (parsed.data.notes !== undefined)        { sets.push(`notes = $${idx++}`);          vals.push(parsed.data.notes); }
      sets.push(`updated_at = now()`);
      await client.query(
        `UPDATE dish_recipes SET ${sets.join(', ')} WHERE id = $${idx} AND venue_id = $${idx + 1}`,
        [...vals, req.params.recipeId, venueId(req)],
      );
      if (parsed.data.lines !== undefined) {
        await client.query(`DELETE FROM recipe_lines WHERE recipe_id = $1`, [req.params.recipeId]);
        for (let i = 0; i < parsed.data.lines.length; i++) {
          const l = parsed.data.lines[i];
          await client.query(
            `INSERT INTO recipe_lines (recipe_id, inventory_item_id, sub_recipe_id, ingredient_name, quantity, unit, cost_pence, waste_pct, display_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [req.params.recipeId, l.inventoryItemId ?? null, l.subRecipeId ?? null, l.ingredientName, l.quantity, l.unit, l.costPence, l.wastePct, i],
          );
        }
        // Sync recipe_lines → product_ingredients if recipe has a linked menu item
        const recipeRow = await client.query(
          `SELECT menu_item_id FROM dish_recipes WHERE id = $1`,
          [req.params.recipeId],
        );
        const linkedMenuItemId = recipeRow.rows[0]?.menu_item_id;
        if (linkedMenuItemId) {
          await client.query(`DELETE FROM product_ingredients WHERE product_id = $1`, [linkedMenuItemId]);
          await client.query(
            `INSERT INTO product_ingredients (product_id, inventory_item_id, name, quantity, unit, cost_pence, display_order)
             SELECT $1, rl.inventory_item_id, rl.ingredient_name, rl.quantity, rl.unit,
                    ROUND(rl.cost_pence * (1 + rl.waste_pct / 100.0))::int, rl.display_order
             FROM recipe_lines rl
             WHERE rl.recipe_id = $2
             ORDER BY rl.display_order`,
            [linkedMenuItemId, req.params.recipeId],
          );
        }
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Recipes] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update recipe' });
  }
});

// Delete recipe
router.delete('/recipes/:recipeId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    await pool.query(`DELETE FROM dish_recipes WHERE id = $1 AND venue_id = $2`, [req.params.recipeId, venueId(req)]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Recipes] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete recipe' });
  }
});


// ─── Publish recipe sell price to menu item ──────────────────────────────────

router.post('/recipes/:recipeId/publish', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { sellPricePence } = z.object({ sellPricePence: z.number().int().min(1) }).parse(req.body);
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT menu_item_id FROM dish_recipes WHERE id = $1 AND venue_id = $2`,
      [req.params.recipeId, venueId(req)],
    );
    if (!rows.length || !rows[0].menu_item_id) {
      res.status(400).json({ success: false, error: 'Recipe has no linked menu item' });
      return;
    }
    const menuItemId = rows[0].menu_item_id;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Update sell price on the linked menu item
      await client.query(
        `UPDATE menu_items SET current_price = $1, base_price = $1, last_updated_at = now() WHERE id = $2 AND venue_id = $3`,
        [sellPricePence, menuItemId, venueId(req)],
      );
      // Sync recipe_lines → product_ingredients (full replace)
      await client.query(`DELETE FROM product_ingredients WHERE product_id = $1`, [menuItemId]);
      await client.query(
        `INSERT INTO product_ingredients (product_id, inventory_item_id, name, quantity, unit, cost_pence, display_order)
         SELECT $1, rl.inventory_item_id, rl.ingredient_name, rl.quantity, rl.unit,
                ROUND(rl.cost_pence * (1 + rl.waste_pct / 100.0))::int, rl.display_order
         FROM recipe_lines rl
         WHERE rl.recipe_id = $2
         ORDER BY rl.display_order`,
        [menuItemId, req.params.recipeId],
      );
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Recipes] Publish error:', err);
    res.status(500).json({ success: false, error: 'Failed to publish price' });
  }
});

export default router;
