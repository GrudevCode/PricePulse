import { Router, Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { getIo } from '../../lib/socket';

const router = Router({ mergeParams: true });

const inventoryStatusValues = ['low', 'ok', 'high'] as const;

const itemSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().min(1).max(100),
  onHand: z.number().int().min(0).default(0),
  parLevel: z.number().int().min(0).default(0),
  unit: z.string().min(1).max(100),
  unitCostPence: z.number().int().min(0).default(0),
  velocityPerNight: z.number().min(0).default(0),
  status: z.enum(inventoryStatusValues).default('ok'),
});
const sectionSchema = z.object({
  name: z.string().min(1).max(100),
});

// GET /api/venues/:id/inventory-sections
router.get('/inventory-sections', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    let sections = await db.query.inventorySections.findMany({
      where: eq(schema.inventorySections.venueId, req.params.id),
      orderBy: [asc(schema.inventorySections.displayOrder), asc(schema.inventorySections.name)],
    });

    const items = await db.query.inventoryItems.findMany({
      where: eq(schema.inventoryItems.venueId, req.params.id),
      orderBy: [asc(schema.inventoryItems.category)],
    });
    const existing = new Set(sections.map((s) => s.name));
    const missing = [...new Set(items.map((i) => i.category).filter(Boolean))].filter((name) => !existing.has(name));
    if (missing.length) {
      const startOrder = sections.length;
      await db.insert(schema.inventorySections).values(
        missing.map((name, idx) => ({
          venueId: req.params.id,
          name,
          displayOrder: startOrder + idx + 1,
        })),
      );
      sections = await db.query.inventorySections.findMany({
        where: eq(schema.inventorySections.venueId, req.params.id),
        orderBy: [asc(schema.inventorySections.displayOrder), asc(schema.inventorySections.name)],
      });
    }

    res.json({ success: true, data: sections });
  } catch (err) {
    console.error('[Inventory] List sections error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory sections' });
  }
});

// POST /api/venues/:id/inventory-sections
router.post('/inventory-sections', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const existing = await db.query.inventorySections.findFirst({
      where: and(
        eq(schema.inventorySections.venueId, req.params.id),
        eq(schema.inventorySections.name, parsed.data.name),
      ),
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Section already exists' });
      return;
    }
    const count = await db.query.inventorySections.findMany({
      where: eq(schema.inventorySections.venueId, req.params.id),
    });
    const [created] = await db.insert(schema.inventorySections).values({
      venueId: req.params.id,
      name: parsed.data.name,
      displayOrder: count.length + 1,
    }).returning();
    try {
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, action: 'section_created', sectionId: created.id });
    } catch {
      // Ignore websocket emission failures.
    }
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('[Inventory] Create section error:', err);
    res.status(500).json({ success: false, error: 'Failed to create section' });
  }
});

// PATCH /api/venues/:id/inventory-sections/:sectionId
router.patch('/inventory-sections/:sectionId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sectionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const current = await db.query.inventorySections.findFirst({
      where: and(
        eq(schema.inventorySections.id, req.params.sectionId),
        eq(schema.inventorySections.venueId, req.params.id),
      ),
    });
    if (!current) {
      res.status(404).json({ success: false, error: 'Section not found' });
      return;
    }
    await db.update(schema.inventorySections)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(and(
        eq(schema.inventorySections.id, req.params.sectionId),
        eq(schema.inventorySections.venueId, req.params.id),
      ));
    // Keep existing inventory items in sync when section name changes.
    await db.update(schema.inventoryItems)
      .set({ category: parsed.data.name, updatedAt: new Date() })
      .where(and(
        eq(schema.inventoryItems.venueId, req.params.id),
        eq(schema.inventoryItems.category, current.name),
      ));
    try {
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, action: 'section_updated', sectionId: req.params.sectionId });
    } catch {
      // Ignore websocket emission failures.
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Inventory] Update section error:', err);
    res.status(500).json({ success: false, error: 'Failed to update section' });
  }
});

// DELETE /api/venues/:id/inventory-sections/:sectionId
router.delete('/inventory-sections/:sectionId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const current = await db.query.inventorySections.findFirst({
      where: and(
        eq(schema.inventorySections.id, req.params.sectionId),
        eq(schema.inventorySections.venueId, req.params.id),
      ),
    });
    if (!current) {
      res.status(404).json({ success: false, error: 'Section not found' });
      return;
    }
    // Cascade: delete all items in this section first
    await db.delete(schema.inventoryItems).where(and(
      eq(schema.inventoryItems.venueId, req.params.id),
      eq(schema.inventoryItems.category, current.name),
    ));
    await db.delete(schema.inventorySections).where(and(
      eq(schema.inventorySections.id, req.params.sectionId),
      eq(schema.inventorySections.venueId, req.params.id),
    ));
    try {
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, action: 'section_deleted', sectionId: req.params.sectionId });
    } catch {
      // Ignore websocket emission failures.
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Inventory] Delete section error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete section' });
  }
});

// GET /api/venues/:id/inventory-items
router.get('/inventory-items', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : new Date().toISOString().slice(0, 10);
    const items = await db.query.inventoryItems.findMany({
      where: eq(schema.inventoryItems.venueId, req.params.id),
      orderBy: [asc(schema.inventoryItems.category), asc(schema.inventoryItems.name)],
    });
    const bookings = await db.query.tableBookings.findMany({
      where: and(
        eq(schema.tableBookings.venueId, req.params.id),
        eq(schema.tableBookings.bookingDate, date),
      ),
    });

    const activeCovers = bookings
      .filter((b) => b.status !== 'cancelled' && b.status !== 'no-show')
      .reduce((sum, b) => sum + b.partySize, 0);
    const demandFactor = Math.max(1, activeCovers / 30);

    const data = items.map((it) => {
      const velocity = Number(it.velocityPerNight);
      const projected = Math.max(0, Math.round(it.onHand - velocity * demandFactor));
      const ratio = it.parLevel > 0 ? projected / it.parLevel : 1;
      let liveAvailabilityStatus: 'critical' | 'low' | 'ok' = 'ok';
      if (ratio < 0.4) liveAvailabilityStatus = 'critical';
      else if (ratio < 0.8) liveAvailabilityStatus = 'low';
      return {
        ...it,
        liveProjectedOnHand: projected,
        liveAvailabilityStatus,
      };
    });

    res.json({ success: true, data, meta: { date, activeCovers } });
  } catch (err) {
    console.error('[Inventory] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch inventory items' });
  }
});

// POST /api/venues/:id/inventory-items
router.post('/inventory-items', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = itemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const existing = await db.query.inventoryItems.findFirst({
      where: and(
        eq(schema.inventoryItems.venueId, req.params.id),
        eq(schema.inventoryItems.name, parsed.data.name),
        eq(schema.inventoryItems.category, parsed.data.category),
      ),
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Inventory item already exists in this category' });
      return;
    }
    const [created] = await db.insert(schema.inventoryItems).values({
      venueId: req.params.id,
      name: parsed.data.name,
      category: parsed.data.category,
      onHand: parsed.data.onHand,
      parLevel: parsed.data.parLevel,
      unit: parsed.data.unit,
      unitCostPence: parsed.data.unitCostPence,
      velocityPerNight: String(parsed.data.velocityPerNight),
      status: parsed.data.status,
    }).returning();

    try {
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, action: 'created', itemId: created.id });
    } catch {
      // Ignore websocket emission failures.
    }

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('[Inventory] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create inventory item' });
  }
});

// PATCH /api/venues/:id/inventory-items/:itemId
router.patch('/inventory-items/:itemId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = itemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.onHand !== undefined) updateData.onHand = parsed.data.onHand;
    if (parsed.data.parLevel !== undefined) updateData.parLevel = parsed.data.parLevel;
    if (parsed.data.unit !== undefined) updateData.unit = parsed.data.unit;
    if (parsed.data.unitCostPence !== undefined) updateData.unitCostPence = parsed.data.unitCostPence;
    if (parsed.data.velocityPerNight !== undefined) updateData.velocityPerNight = String(parsed.data.velocityPerNight);
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    const db = getDb();
    const [updated] = await db.update(schema.inventoryItems)
      .set(updateData)
      .where(and(
        eq(schema.inventoryItems.id, req.params.itemId),
        eq(schema.inventoryItems.venueId, req.params.id),
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: 'Inventory item not found' });
      return;
    }

    try {
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, action: 'updated', itemId: updated.id });
    } catch {
      // Ignore websocket emission failures.
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Inventory] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update inventory item' });
  }
});

// DELETE /api/venues/:id/inventory-items/:itemId
router.delete('/inventory-items/:itemId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.delete(schema.inventoryItems)
      .where(and(
        eq(schema.inventoryItems.id, req.params.itemId),
        eq(schema.inventoryItems.venueId, req.params.id),
      ));
    try {
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, action: 'deleted', itemId: req.params.itemId });
    } catch {
      // Ignore websocket emission failures.
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Inventory] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete inventory item' });
  }
});

export default router;
