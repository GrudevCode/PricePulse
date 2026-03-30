import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { eq, and } from 'drizzle-orm';
import { encryptObject, decryptObject } from '../../lib/encryption';
import { getAdapterForProvider } from '../../adapters';

const router = Router({ mergeParams: true });

const createIntegrationSchema = z.object({
  provider: z.enum(['square', 'toast', 'lightspeed', 'wix', 'custom_api', 'qr_only']),
  credentials: z.record(z.unknown()).optional(),
});

// GET /api/venues/:id/integrations
router.get('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const integrations = await db.query.menuIntegrations.findMany({
      where: eq(schema.menuIntegrations.venueId, req.params.id),
    });

    // Never return credentials
    const safe = integrations.map(({ credentialsEncrypted: _, ...i }) => i);
    res.json({ success: true, data: safe });
  } catch (err) {
    console.error('[Integrations] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch integrations' });
  }
});

// POST /api/venues/:id/integrations
router.post('/', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const { provider, credentials } = parsed.data;
    const db = getDb();

    const credentialsEncrypted = credentials
      ? encryptObject(credentials)
      : null;

    const [integration] = await db.insert(schema.menuIntegrations).values({
      venueId: req.params.id,
      provider,
      credentialsEncrypted,
      isActive: true,
    }).returning();

    const { credentialsEncrypted: _, ...safe } = integration;
    res.status(201).json({ success: true, data: safe });
  } catch (err) {
    console.error('[Integrations] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create integration' });
  }
});

// PUT /api/venues/:id/integrations/:intId
router.put('/:intId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { credentials, isActive } = req.body;
    const db = getDb();

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (credentials !== undefined) update.credentialsEncrypted = encryptObject(credentials);
    if (isActive !== undefined) update.isActive = isActive;

    const [integration] = await db.update(schema.menuIntegrations)
      .set(update)
      .where(and(
        eq(schema.menuIntegrations.id, req.params.intId),
        eq(schema.menuIntegrations.venueId, req.params.id)
      ))
      .returning();

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    const { credentialsEncrypted: _, ...safe } = integration;
    res.json({ success: true, data: safe });
  } catch (err) {
    console.error('[Integrations] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update integration' });
  }
});

// DELETE /api/venues/:id/integrations/:intId
router.delete('/:intId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.delete(schema.menuIntegrations)
      .where(and(
        eq(schema.menuIntegrations.id, req.params.intId),
        eq(schema.menuIntegrations.venueId, req.params.id)
      ));
    res.json({ success: true, message: 'Integration deleted' });
  } catch (err) {
    console.error('[Integrations] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete integration' });
  }
});

// POST /api/venues/:id/integrations/:intId/sync
router.post('/:intId/sync', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const integration = await db.query.menuIntegrations.findFirst({
      where: and(
        eq(schema.menuIntegrations.id, req.params.intId),
        eq(schema.menuIntegrations.venueId, req.params.id)
      ),
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    const credentials = integration.credentialsEncrypted
      ? decryptObject<Record<string, unknown>>(integration.credentialsEncrypted as string)
      : {};

    const adapter = getAdapterForProvider(integration.provider, req.params.id, credentials);
    const items = await adapter.fetchMenuItems();

    // Upsert menu items from POS
    let synced = 0;
    for (const item of items) {
      const existing = await db.query.menuItems.findFirst({
        where: and(
          eq(schema.menuItems.venueId, req.params.id),
          eq(schema.menuItems.externalId, item.externalId || '')
        ),
      });

      if (existing) {
        await db.update(schema.menuItems)
          .set({ name: item.name, category: item.category, lastUpdatedAt: new Date() })
          .where(eq(schema.menuItems.id, existing.id));
      } else {
        await db.insert(schema.menuItems).values({
          venueId: req.params.id,
          externalId: item.externalId,
          name: item.name,
          category: item.category,
          basePrice: item.basePrice,
          currentPrice: item.currentPrice,
          minPrice: Math.round(item.basePrice * 0.8),
          maxPrice: Math.round(item.basePrice * 1.5),
        });
      }
      synced++;
    }

    await db.update(schema.menuIntegrations)
      .set({ lastSyncAt: new Date() })
      .where(eq(schema.menuIntegrations.id, req.params.intId));

    res.json({ success: true, data: { synced } });
  } catch (err) {
    console.error('[Integrations] Sync error:', err);
    res.status(500).json({ success: false, error: 'Sync failed: ' + (err as Error).message });
  }
});

// POST /api/venues/:id/integrations/:intId/test
router.post('/:intId/test', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const integration = await db.query.menuIntegrations.findFirst({
      where: and(
        eq(schema.menuIntegrations.id, req.params.intId),
        eq(schema.menuIntegrations.venueId, req.params.id)
      ),
    });

    if (!integration) {
      res.status(404).json({ success: false, error: 'Integration not found' });
      return;
    }

    const credentials = integration.credentialsEncrypted
      ? decryptObject<Record<string, unknown>>(integration.credentialsEncrypted as string)
      : {};

    const adapter = getAdapterForProvider(integration.provider, req.params.id, credentials);
    const ok = await adapter.testConnection();

    res.json({ success: true, data: { connected: ok } });
  } catch (err) {
    console.error('[Integrations] Test error:', err);
    res.status(500).json({ success: false, error: 'Test failed: ' + (err as Error).message });
  }
});

export default router;
