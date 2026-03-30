import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, and, asc } from 'drizzle-orm';

const router = Router({ mergeParams: true });

const schedulePeriodSchema = z.object({
  id:    z.string(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const menuSchema = z.object({
  name:         z.string().min(1).max(255),
  description:  z.string().optional().nullable(),
  isActive:     z.boolean().default(true),
  displayOrder: z.number().int().default(0),
  scheduleJson: z.array(schedulePeriodSchema).default([]),
  color:        z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
});

// GET /api/venues/:id/menus
router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const menus = await db.query.menus.findMany({
      where: eq(schema.menus.venueId, req.params.id),
      orderBy: [asc(schema.menus.displayOrder), asc(schema.menus.createdAt)],
    });
    res.json({ success: true, data: menus });
  } catch (err) {
    console.error('[Menus] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch menus' });
  }
});

// POST /api/venues/:id/menus
router.post('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = menuSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const [menu] = await db.insert(schema.menus)
      .values({ venueId: req.params.id, ...parsed.data })
      .returning();
    res.status(201).json({ success: true, data: menu });
  } catch (err) {
    console.error('[Menus] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create menu' });
  }
});

// PATCH /api/venues/:id/menus/:menuId
router.patch('/:menuId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = menuSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const [menu] = await db.update(schema.menus)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(schema.menus.id, req.params.menuId), eq(schema.menus.venueId, req.params.id)))
      .returning();
    if (!menu) { res.status(404).json({ success: false, error: 'Menu not found' }); return; }
    res.json({ success: true, data: menu });
  } catch (err) {
    console.error('[Menus] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update menu' });
  }
});

// DELETE /api/venues/:id/menus/:menuId
router.delete('/:menuId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.delete(schema.menus)
      .where(and(eq(schema.menus.id, req.params.menuId), eq(schema.menus.venueId, req.params.id)));
    res.json({ success: true });
  } catch (err) {
    console.error('[Menus] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete menu' });
  }
});

export default router;
