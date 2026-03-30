import { Router, Request, Response } from 'express';
import { getDb, schema } from '../db';
import { eq } from 'drizzle-orm';

const router = Router();

// Store SSE clients per venue
const sseClients = new Map<string, Set<Response>>();

export function addSseClient(venueId: string, res: Response): void {
  if (!sseClients.has(venueId)) sseClients.set(venueId, new Set());
  sseClients.get(venueId)!.add(res);
}

export function removeSseClient(venueId: string, res: Response): void {
  sseClients.get(venueId)?.delete(res);
}

export function broadcastPriceUpdate(
  venueId: string,
  updates: Array<{ itemId: string; newPricePence: number }>
): void {
  const clients = sseClients.get(venueId);
  if (!clients || clients.size === 0) return;

  const data = `event: price_update\ndata: ${JSON.stringify(updates)}\n\n`;
  for (const client of clients) {
    try {
      client.write(data);
    } catch {
      clients.delete(client);
    }
  }
}

// GET /sse/menu/:venueId — SSE stream for public menu
router.get('/menu/:venueId', async (req: Request, res: Response) => {
  const { venueId } = req.params;

  const db = getDb();
  const venue = await db.query.venues.findFirst({ where: eq(schema.venues.id, venueId) });
  if (!venue) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Send heartbeat
  res.write(`: heartbeat\n\n`);
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  addSseClient(venueId, res);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(venueId, res);
  });
});

export default router;
