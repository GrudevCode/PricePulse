import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, getPool, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, and } from 'drizzle-orm';
import { getMenuItemIngredientStockMap } from '../../lib/ingredientStock';

const router = Router({ mergeParams: true });

const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100).default('Other'),
  categoryId: z.string().uuid().optional(),
  basePrice: z.number().int().positive(),
  minPrice: z.number().int().positive().optional(),
  maxPrice: z.number().int().positive().optional(),
  description: z.string().optional(),
  isDynamicPricingEnabled: z.boolean().default(true),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  basePrice: z.number().int().positive().optional(),
  /** Selling / reference price shown on menu and used in margin calculations */
  currentPrice: z.number().int().positive().optional(),
  minPrice: z.number().int().positive().optional(),
  maxPrice: z.number().int().positive().optional(),
  isDynamicPricingEnabled: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  intelligentInventorySync: z.boolean().optional(),
  description: z.string().optional(),
});

// GET /api/venues/:id/menu-items
router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const items = await db.query.menuItems.findMany({
      where: eq(schema.menuItems.venueId, req.params.id),
      orderBy: (m, { asc }) => [asc(m.category), asc(m.name)],
    });
    const stockMap = await getMenuItemIngredientStockMap(req.params.id);
    const data = items.map((row) => {
      const ingredientStockStatus = stockMap.get(row.id) ?? 'not_tracked';
      const intelligentlyHidden =
        !!row.intelligentInventorySync && ingredientStockStatus === 'out_of_stock';
      return {
        ...row,
        ingredientStockStatus,
        intelligentlyHidden,
      };
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Menu] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch menu items' });
  }
});

// POST /api/venues/:id/menu-items
router.post('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const { basePrice, minPrice, maxPrice, ...rest } = parsed.data;
    const db = getDb();

    const [item] = await db.insert(schema.menuItems).values({
      venueId: req.params.id,
      basePrice,
      currentPrice: basePrice,
      minPrice: minPrice ?? Math.round(basePrice * 0.8),
      maxPrice: maxPrice ?? Math.round(basePrice * 1.5),
      ...rest,
    }).returning();

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error('[Menu] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create menu item' });
  }
});

async function handleUpdateItem(req: AuthRequest, res: Response) {
  try {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const [item] = await db.update(schema.menuItems)
      .set({ ...parsed.data, lastUpdatedAt: new Date() })
      .where(and(
        eq(schema.menuItems.id, req.params.itemId),
        eq(schema.menuItems.venueId, req.params.id)
      ))
      .returning();

    if (!item) {
      res.status(404).json({ success: false, error: 'Menu item not found' });
      return;
    }

    res.json({ success: true, data: item });
  } catch (err) {
    console.error('[Menu] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update menu item' });
  }
}

// PUT /api/venues/:id/menu-items/:itemId
router.put('/:itemId', requireAuth, requireVenueAccess, handleUpdateItem);

// PATCH /api/venues/:id/menu-items/:itemId (partial update — same logic)
router.patch('/:itemId', requireAuth, requireVenueAccess, handleUpdateItem);

// DELETE /api/venues/:id/menu-items/:itemId
router.delete('/:itemId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const venueId = req.params.id;
    const itemId = req.params.itemId;
    const pool = getPool();

    // Break FKs that still reference menu_items (works even if migration 0024 was not applied).
    await pool.query(
      `UPDATE pos_ticket_items pti
       SET menu_item_id = NULL, updated_at = NOW()
       FROM pos_tickets pt
       WHERE pti.ticket_id = pt.id AND pt.venue_id = $1::uuid AND pti.menu_item_id = $2::uuid`,
      [venueId, itemId],
    );
    await pool.query(
      `DELETE FROM dish_recipes WHERE venue_id = $1::uuid AND menu_item_id = $2::uuid`,
      [venueId, itemId],
    );

    const removed = await db.delete(schema.menuItems)
      .where(and(
        eq(schema.menuItems.id, itemId),
        eq(schema.menuItems.venueId, venueId)
      ))
      .returning({ id: schema.menuItems.id });
    if (removed.length === 0) {
      res.status(404).json({ success: false, error: 'Menu item not found' });
      return;
    }
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    console.error('[Menu] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete menu item' });
  }
});

// POST /api/venues/:id/menu-items/bulk-update
router.post('/bulk-update', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { updates } = req.body as { updates: Array<{ id: string; currentPrice: number }> };
    if (!Array.isArray(updates)) {
      res.status(400).json({ success: false, error: 'updates array required' });
      return;
    }

    const db = getDb();
    let count = 0;
    for (const upd of updates) {
      await db.update(schema.menuItems)
        .set({
          currentPrice: upd.currentPrice,
          basePrice: upd.currentPrice,
          lastUpdatedAt: new Date(),
        })
        .where(and(
          eq(schema.menuItems.id, upd.id),
          eq(schema.menuItems.venueId, req.params.id)
        ));
      count++;
    }

    res.json({ success: true, data: { updated: count } });
  } catch (err) {
    console.error('[Menu] Bulk update error:', err);
    res.status(500).json({ success: false, error: 'Failed to bulk update' });
  }
});

export default router;
