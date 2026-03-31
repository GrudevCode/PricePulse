import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, and, inArray } from 'drizzle-orm';
import { normalizeQrMenuSettings } from '@pricepulse/shared';

const router = Router();

const createVenueSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  capacity: z.number().int().positive().default(100),
  cuisineType: z.string().min(1).max(100).default('bar'),
  pricingMode: z.enum(['auto', 'suggest', 'manual']).default('suggest'),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  competitorNotes: z.string().optional(),
  publicMenuStyle: z.enum(['gourmet', 'fast_food']).optional(),
});

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `${base}-${random}`;
}

// GET /api/venues
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const userVenues = await db.query.venues.findMany({
      where: eq(schema.venues.userId, req.userId!),
      orderBy: (v, { desc }) => [desc(v.createdAt)],
    });
    res.json({ success: true, data: userVenues });
  } catch (err) {
    console.error('[Venues] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch venues' });
  }
});

// POST /api/venues
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const slug = generateSlug(parsed.data.name);

    const [venue] = await db.insert(schema.venues).values({
      ...parsed.data,
      lat: String(parsed.data.lat),
      lng: String(parsed.data.lng),
      userId: req.userId!,
      slug,
    }).returning();

    res.status(201).json({ success: true, data: venue });
  } catch (err) {
    console.error('[Venues] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create venue' });
  }
});

const qrMenuSettingsPatchSchema = z.object({
  menuIds:       z.array(z.string().uuid()).optional(),
  useSchedule:   z.boolean().optional(),
  defaultMenuId: z.string().uuid().nullable().optional(),
});

// PATCH /api/venues/:id/qr-menu-settings — QR public menu pool + schedule / fallback
router.patch('/:id/qr-menu-settings', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = qrMenuSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const venue = await db.query.venues.findFirst({
      where: and(eq(schema.venues.id, req.params.id), eq(schema.venues.userId, req.userId!)),
    });
    if (!venue) {
      res.status(404).json({ success: false, error: 'Venue not found' });
      return;
    }

    const prev = normalizeQrMenuSettings(venue.qrMenuSettings);
    const merged = normalizeQrMenuSettings({ ...prev, ...parsed.data });

    const menuIds = merged.menuIds ?? [];
    const refIds = [...new Set([...menuIds, ...(merged.defaultMenuId ? [merged.defaultMenuId] : [])])];

    if (refIds.length > 0) {
      const rows = await db.query.menus.findMany({
        where: and(eq(schema.menus.venueId, req.params.id), inArray(schema.menus.id, refIds)),
      });
      if (rows.length !== refIds.length) {
        res.status(400).json({ success: false, error: 'One or more menus are invalid for this venue' });
        return;
      }
    }

    const stored = {
      menuIds,
      useSchedule: merged.useSchedule === true,
      defaultMenuId: merged.defaultMenuId ?? null,
    };

    const [updated] = await db.update(schema.venues)
      .set({ qrMenuSettings: stored, updatedAt: new Date() })
      .where(and(eq(schema.venues.id, req.params.id), eq(schema.venues.userId, req.userId!)))
      .returning();

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Venues] QR menu settings error:', err);
    res.status(500).json({ success: false, error: 'Failed to update QR menu settings' });
  }
});

// GET /api/venues/:id
router.get('/:id', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const venue = await db.query.venues.findFirst({
      where: and(eq(schema.venues.id, req.params.id), eq(schema.venues.userId, req.userId!)),
    });
    res.json({ success: true, data: venue });
  } catch (err) {
    console.error('[Venues] Get error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch venue' });
  }
});

// PUT /api/venues/:id
router.put('/:id', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createVenueSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.lat !== undefined) updateData.lat = String(parsed.data.lat);
    if (parsed.data.lng !== undefined) updateData.lng = String(parsed.data.lng);

    const [venue] = await db.update(schema.venues)
      .set(updateData)
      .where(and(eq(schema.venues.id, req.params.id), eq(schema.venues.userId, req.userId!)))
      .returning();

    res.json({ success: true, data: venue });
  } catch (err) {
    console.error('[Venues] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update venue' });
  }
});

// PATCH /api/venues/:id — partial update (publicMenuStyle, brandColor, etc.)
router.patch('/:id', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createVenueSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.lat !== undefined) updateData.lat = String(parsed.data.lat);
    if (parsed.data.lng !== undefined) updateData.lng = String(parsed.data.lng);

    const [venue] = await db.update(schema.venues)
      .set(updateData)
      .where(and(eq(schema.venues.id, req.params.id), eq(schema.venues.userId, req.userId!)))
      .returning();

    res.json({ success: true, data: venue });
  } catch (err) {
    console.error('[Venues] Patch error:', err);
    res.status(500).json({ success: false, error: 'Failed to update venue' });
  }
});

// DELETE /api/venues/:id
router.delete('/:id', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.delete(schema.venues)
      .where(and(eq(schema.venues.id, req.params.id), eq(schema.venues.userId, req.userId!)));
    res.json({ success: true, message: 'Venue deleted' });
  } catch (err) {
    console.error('[Venues] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete venue' });
  }
});

// PUT /api/venues/:id/occupancy (webhook from POS or manual)
router.put('/:id/occupancy', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { occupancyPct } = req.body;
    if (typeof occupancyPct !== 'number' || occupancyPct < 0 || occupancyPct > 100) {
      res.status(400).json({ success: false, error: 'occupancyPct must be 0-100' });
      return;
    }
    const db = getDb();
    await db.update(schema.venues)
      .set({ currentOccupancyPct: Math.round(occupancyPct), updatedAt: new Date() })
      .where(eq(schema.venues.id, req.params.id));

    res.json({ success: true, message: 'Occupancy updated' });
  } catch (err) {
    console.error('[Venues] Occupancy update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update occupancy' });
  }
});

export default router;
