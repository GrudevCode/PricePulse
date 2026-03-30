import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, and, asc } from 'drizzle-orm';

const router = Router({ mergeParams: true });

const categorySchema = z.object({
  name:         z.string().min(1).max(255),
  description:  z.string().optional().nullable(),
  displayOrder: z.number().int().default(0),
});

// GET /api/venues/:id/menus/:menuId/categories
router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // verify menu belongs to venue
    const menu = await db.query.menus.findFirst({
      where: and(eq(schema.menus.id, req.params.menuId), eq(schema.menus.venueId, req.params.id)),
    });
    if (!menu) { res.status(404).json({ success: false, error: 'Menu not found' }); return; }

    const categories = await db.query.menuCategories.findMany({
      where: eq(schema.menuCategories.menuId, req.params.menuId),
      orderBy: [asc(schema.menuCategories.displayOrder), asc(schema.menuCategories.name)],
    });
    res.json({ success: true, data: categories });
  } catch (err) {
    console.error('[Categories] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// POST /api/venues/:id/menus/:menuId/categories
router.post('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const menu = await db.query.menus.findFirst({
      where: and(eq(schema.menus.id, req.params.menuId), eq(schema.menus.venueId, req.params.id)),
    });
    if (!menu) { res.status(404).json({ success: false, error: 'Menu not found' }); return; }

    const [cat] = await db.insert(schema.menuCategories)
      .values({ menuId: req.params.menuId, ...parsed.data })
      .returning();
    res.status(201).json({ success: true, data: cat });
  } catch (err) {
    console.error('[Categories] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
});

// PATCH /api/venues/:id/menus/:menuId/categories/:catId
router.patch('/:catId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = categorySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const [cat] = await db.update(schema.menuCategories)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(schema.menuCategories.id, req.params.catId), eq(schema.menuCategories.menuId, req.params.menuId)))
      .returning();
    if (!cat) { res.status(404).json({ success: false, error: 'Category not found' }); return; }
    res.json({ success: true, data: cat });
  } catch (err) {
    console.error('[Categories] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
});

// DELETE /api/venues/:id/menus/:menuId/categories/:catId
router.delete('/:catId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const menu = await db.query.menus.findFirst({
      where: and(eq(schema.menus.id, req.params.menuId), eq(schema.menus.venueId, req.params.id)),
    });
    if (!menu) {
      res.status(404).json({ success: false, error: 'Menu not found' });
      return;
    }
    const removed = await db.delete(schema.menuCategories)
      .where(and(eq(schema.menuCategories.id, req.params.catId), eq(schema.menuCategories.menuId, req.params.menuId)))
      .returning({ id: schema.menuCategories.id });
    if (removed.length === 0) {
      res.status(404).json({ success: false, error: 'Category not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Categories] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  }
});

export default router;
