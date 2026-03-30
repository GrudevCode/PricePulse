import { Router, Response } from 'express';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, desc } from 'drizzle-orm';
import { collectSignals } from '../../services/signalCollector';

const router = Router({ mergeParams: true });

// GET /api/venues/:id/signals
router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const latest = await db.query.signalSnapshots.findFirst({
      where: eq(schema.signalSnapshots.venueId, req.params.id),
      orderBy: [desc(schema.signalSnapshots.capturedAt)],
    });
    res.json({ success: true, data: latest });
  } catch (err) {
    console.error('[Signals] Get error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch signals' });
  }
});

// POST /api/venues/:id/signals/collect
router.post('/collect', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await collectSignals(req.params.id);
    res.json({ success: true, data: snapshot });
  } catch (err) {
    console.error('[Signals] Collect error:', err);
    res.status(500).json({ success: false, error: 'Failed to collect signals' });
  }
});

// GET /api/venues/:id/signals/history
router.get('/history', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const hours = parseInt(String(req.query.hours || 24));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const db = getDb();

    const snapshots = await db.query.signalSnapshots.findMany({
      where: (s, { and, gte }) => and(
        eq(s.venueId, req.params.id),
        gte(s.capturedAt, since)
      ),
      orderBy: [desc(schema.signalSnapshots.capturedAt)],
      limit: 200,
    });

    res.json({ success: true, data: snapshots });
  } catch (err) {
    console.error('[Signals] History error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch signal history' });
  }
});

export default router;
