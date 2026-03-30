import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, and, gte, lte, inArray, SQL, sql } from 'drizzle-orm';

const router = Router({ mergeParams: true });

const timeSwitchSchema = z.object({
  hhmm:   z.string().regex(/^\d{2}:\d{2}$/),
  menuId: z.string().uuid(),
});

const assignmentSchema = z.object({
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  menuId:        z.string().uuid().nullable(),
  timeSwitches:  z.array(timeSwitchSchema).optional(),
});

// ─── GET /api/venues/:id/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD ──────────────

router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const db = getDb();

    const conditions: SQL[] = [eq(schema.venueSchedule.venueId, req.params.id)];
    if (from) conditions.push(gte(schema.venueSchedule.scheduleDate, from));
    if (to)   conditions.push(lte(schema.venueSchedule.scheduleDate, to));

    const rows = await db
      .select()
      .from(schema.venueSchedule)
      .where(and(...conditions));
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Schedule] Get error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch schedule' });
  }
});

// ─── PUT /api/venues/:id/schedule ─────────────────────────────────────────────
// Body: { assignments: [{ date, menuId: uuid | null, timeSwitches?: { hhmm, menuId }[] }] }

router.put('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const bodySchema = z.object({
      assignments: z.array(assignmentSchema),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const venueId = req.params.id;
    const { assignments } = parsed.data;

    const toDelete = assignments.filter((a) => a.menuId === null).map((a) => a.date);
    const toUpsert = assignments.filter((a) => a.menuId !== null) as Array<{
      date: string;
      menuId: string;
      timeSwitches?: Array<{ hhmm: string; menuId: string }>;
    }>;

    const menuIdSet = new Set<string>();
    for (const a of toUpsert) {
      menuIdSet.add(a.menuId);
      for (const sw of a.timeSwitches ?? []) {
        menuIdSet.add(sw.menuId);
      }
    }
    if (menuIdSet.size > 0) {
      const ids = [...menuIdSet];
      const menuRows = await db.query.menus.findMany({
        where: and(eq(schema.menus.venueId, venueId), inArray(schema.menus.id, ids)),
      });
      if (menuRows.length !== ids.length) {
        res.status(400).json({ success: false, error: 'One or more menus are invalid for this venue' });
        return;
      }
    }

    for (const a of toUpsert) {
      const hhmmSeen = new Set<string>();
      for (const sw of a.timeSwitches ?? []) {
        if (hhmmSeen.has(sw.hhmm)) {
          res.status(400).json({ success: false, error: `Duplicate switch time ${sw.hhmm} on ${a.date}` });
          return;
        }
        hhmmSeen.add(sw.hhmm);
      }
    }

    if (toDelete.length > 0) {
      await db
        .delete(schema.venueSchedule)
        .where(
          and(
            eq(schema.venueSchedule.venueId, venueId),
            inArray(schema.venueSchedule.scheduleDate, toDelete),
          ),
        );
    }

    if (toUpsert.length > 0) {
      await db
        .insert(schema.venueSchedule)
        .values(
          toUpsert.map((a) => ({
            venueId,
            scheduleDate: a.date,
            menuId:       a.menuId,
            timeSwitches: a.timeSwitches ?? [],
          })),
        )
        .onConflictDoUpdate({
          target: [schema.venueSchedule.venueId, schema.venueSchedule.scheduleDate],
          set: {
            menuId:       sql`EXCLUDED.menu_id`,
            timeSwitches: sql`EXCLUDED.time_switches`,
            updatedAt:    new Date(),
          },
        });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Schedule] Save error:', err);
    res.status(500).json({ success: false, error: 'Failed to save schedule' });
  }
});

export default router;
