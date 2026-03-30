import { Router, Response } from 'express';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, desc, and, gte } from 'drizzle-orm';
import QRCode from 'qrcode';

const router = Router({ mergeParams: true });

/** Base URL for QR links: env may be full menu URL by mistake — we only keep origin and append /menu/:slug. */
function resolveQrMenuPublicOrigin(): string {
  const raw = (
    process.env.QR_MENU_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  )
    .trim()
    .replace(/\/$/, '');
  if (!raw) return 'http://localhost:5173';
  try {
    const href = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    return new URL(href).origin;
  } catch {
    return raw;
  }
}

// GET /api/venues/:id/dashboard
router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const venueId = req.params.id;

    const [venue, items, latestDecision, latestSignal] = await Promise.all([
      db.query.venues.findFirst({ where: eq(schema.venues.id, venueId) }),
      db.query.menuItems.findMany({ where: eq(schema.menuItems.venueId, venueId) }),
      db.query.pricingDecisions.findFirst({
        where: eq(schema.pricingDecisions.venueId, venueId),
        orderBy: [desc(schema.pricingDecisions.decidedAt)],
      }),
      db.query.signalSnapshots.findFirst({
        where: eq(schema.signalSnapshots.venueId, venueId),
        orderBy: [desc(schema.signalSnapshots.capturedAt)],
      }),
    ]);

    // Compute revenue impact estimate
    let estimatedRevenueImpact = 0;
    if (latestDecision?.appliedMultiplier) {
      const multiplier = parseFloat(String(latestDecision.appliedMultiplier));
      const avgBasePrice = items.reduce((sum, i) => sum + i.basePrice, 0) / (items.length || 1);
      const estimatedOrders = (venue?.currentOccupancyPct ?? 0) / 100 * (venue?.capacity ?? 0) * 3;
      estimatedRevenueImpact = Math.round((multiplier - 1) * avgBasePrice * estimatedOrders);
    }

    const dynamicCount = items.filter((i) => i.isDynamicPricingEnabled).length;

    // Get 24h average multiplier
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentDecisions = await db.query.pricingDecisions.findMany({
      where: and(
        eq(schema.pricingDecisions.venueId, venueId),
        gte(schema.pricingDecisions.decidedAt, since24h)
      ),
    });

    const avgMultiplier = recentDecisions.length > 0
      ? recentDecisions.reduce((sum, d) => sum + parseFloat(String(d.recommendedMultiplier || '1')), 0) / recentDecisions.length
      : 1.0;

    res.json({
      success: true,
      data: {
        venue,
        currentSignals: latestSignal,
        latestDecision,
        estimatedRevenueImpact,
        totalItemsDynamic: dynamicCount,
        totalItems: items.length,
        avgMultiplierToday: Math.round(avgMultiplier * 100) / 100,
      },
    });
  } catch (err) {
    console.error('[Dashboard] Error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/venues/:id/dashboard/qr — get QR code for hosted menu
router.get('/qr', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.id, req.params.id),
    });

    if (!venue) {
      res.status(404).json({ success: false, error: 'Venue not found' });
      return;
    }

    // QR_MENU_PUBLIC_URL: frontend origin only, e.g. http://192.168.1.5:5173 (same Wi‑Fi as the phone). Not /menu/... — we add that. Localhost in QR won't work on a real device.
    const menuUrl = `${resolveQrMenuPublicOrigin()}/menu/${venue.slug}`;
    const qrDataUrl = await QRCode.toDataURL(menuUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    res.json({ success: true, data: { menuUrl, qrDataUrl } });
  } catch (err) {
    console.error('[Dashboard] QR error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate QR' });
  }
});

export default router;
