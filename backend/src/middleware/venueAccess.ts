import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getDb, schema } from '../db';
import { eq, and } from 'drizzle-orm';

export async function requireVenueAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { id: venueId } = req.params;
  if (!venueId) {
    res.status(400).json({ success: false, error: 'Venue ID required' });
    return;
  }

  const db = getDb();
  const venue = await db.query.venues.findFirst({
    where: and(
      eq(schema.venues.id, venueId),
      eq(schema.venues.userId, req.userId!)
    ),
  });

  if (!venue) {
    res.status(404).json({ success: false, error: 'Venue not found' });
    return;
  }

  next();
}
