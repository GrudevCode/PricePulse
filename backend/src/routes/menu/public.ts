import { Router, Request, Response } from 'express';
import { getDb, schema } from '../../db';
import { eq } from 'drizzle-orm';
import {
  buildPublicMenu,
  calendarDateLondon,
  parseOptionalForDate,
  parseOptionalForTimeHm,
  publicMenuToJsonPayload,
  renderPublicMenuHtml,
} from '../../lib/publicMenuPage';

const router = Router();

// GET /menu/:venueSlug/json — must be registered before /:venueSlug
router.get('/:venueSlug/json', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, req.params.venueSlug),
    });

    if (!venue) {
      res.status(404).json({ success: false, error: 'Menu not found' });
      return;
    }

    const forDate = parseOptionalForDate(req.query.forDate) ?? calendarDateLondon();
    const forTimeHm = parseOptionalForTimeHm(req.query.forTime);
    const built = await buildPublicMenu(db, venue, forDate, forTimeHm);
    const payload = publicMenuToJsonPayload(venue, built, forDate);

    res.json({ success: true, data: payload });
  } catch (err) {
    console.error('[PublicMenu] JSON error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch menu' });
  }
});

// GET /menu/:venueSlug — public hosted menu page with SSE
// Optional query: forDate=YYYY-MM-DD (preview which calendar day the schedule uses)
router.get('/:venueSlug', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const venue = await db.query.venues.findFirst({
      where: eq(schema.venues.slug, req.params.venueSlug),
    });

    if (!venue) {
      res.status(404).send('<h1>Menu not found</h1>');
      return;
    }

    const forDate = parseOptionalForDate(req.query.forDate) ?? calendarDateLondon();
    const forTimeHm = parseOptionalForTimeHm(req.query.forTime);
    const built = await buildPublicMenu(db, venue, forDate, forTimeHm);
    const html = renderPublicMenuHtml(venue, built, forDate);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[PublicMenu] Error:', err);
    res.status(500).send('<h1>Something went wrong</h1>');
  }
});

export default router;
