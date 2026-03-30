import { Router, Response } from 'express';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, desc } from 'drizzle-orm';
import { triggerImmediatePricing } from '../../jobs/pricingQueue';
import { approvePricingDecision, chatWithClaude } from '../../services/claudePricingEngine';

const router = Router({ mergeParams: true });

// GET /api/venues/:id/pricing/current
router.get('/current', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const latest = await db.query.pricingDecisions.findFirst({
      where: eq(schema.pricingDecisions.venueId, req.params.id),
      orderBy: [desc(schema.pricingDecisions.decidedAt)],
    });

    const latestSignal = await db.query.signalSnapshots.findFirst({
      where: eq(schema.signalSnapshots.venueId, req.params.id),
      orderBy: [desc(schema.signalSnapshots.capturedAt)],
    });

    res.json({ success: true, data: { decision: latest, signals: latestSignal } });
  } catch (err) {
    console.error('[Pricing] Current error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pricing' });
  }
});

// POST /api/venues/:id/pricing/trigger
router.post('/trigger', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    await triggerImmediatePricing(req.params.id);
    res.json({ success: true, message: 'Pricing analysis triggered' });
  } catch (err) {
    console.error('[Pricing] Trigger error:', err);
    res.status(500).json({ success: false, error: 'Failed to trigger pricing' });
  }
});

// POST /api/venues/:id/pricing/approve
router.post('/approve', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { decisionId } = req.body;
    if (!decisionId) {
      res.status(400).json({ success: false, error: 'decisionId required' });
      return;
    }
    await approvePricingDecision(decisionId, req.params.id);
    res.json({ success: true, message: 'Pricing approved and applied' });
  } catch (err) {
    console.error('[Pricing] Approve error:', err);
    res.status(500).json({ success: false, error: 'Failed to approve pricing' });
  }
});

// POST /api/venues/:id/pricing/override
router.post('/override', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, newPricePence } = req.body;
    if (!itemId || typeof newPricePence !== 'number') {
      res.status(400).json({ success: false, error: 'itemId and newPricePence required' });
      return;
    }
    const db = getDb();
    await db.update(schema.menuItems)
      .set({ currentPrice: newPricePence, lastUpdatedAt: new Date() })
      .where(eq(schema.menuItems.id, itemId));

    res.json({ success: true, message: 'Price overridden' });
  } catch (err) {
    console.error('[Pricing] Override error:', err);
    res.status(500).json({ success: false, error: 'Failed to override price' });
  }
});

// GET /api/venues/:id/pricing/history
router.get('/history', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(String(req.query.page || 1));
    const pageSize = parseInt(String(req.query.pageSize || 20));
    const db = getDb();

    const decisions = await db.query.pricingDecisions.findMany({
      where: eq(schema.pricingDecisions.venueId, req.params.id),
      orderBy: [desc(schema.pricingDecisions.decidedAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    res.json({ success: true, data: decisions });
  } catch (err) {
    console.error('[Pricing] History error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// POST /api/venues/:id/pricing/chat
router.post('/chat', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) {
      res.status(400).json({ success: false, error: 'message required' });
      return;
    }
    const result = await chatWithClaude(req.params.id, message, history);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Pricing] Chat error:', err);
    res.status(500).json({ success: false, error: 'Chat failed' });
  }
});

export default router;
