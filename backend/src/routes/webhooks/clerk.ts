import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db';

const router = Router();

/**
 * POST /api/webhooks/clerk
 *
 * Handles Clerk user lifecycle events so our database stays in sync:
 *   user.created  → upsert row in users table
 *   user.updated  → update name / email
 *   user.deleted  → soft-delete or anonymise (optional)
 *
 * Setup in Clerk dashboard:
 *   Webhooks → Add endpoint → https://your-domain/api/webhooks/clerk
 *   Events to subscribe: user.created, user.updated, user.deleted
 *   Copy the "Signing Secret" → set CLERK_WEBHOOK_SECRET in .env
 */
router.post('/', async (req: Request, res: Response) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Clerk Webhook] CLERK_WEBHOOK_SECRET is not set');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  // Verify signature using svix
  const svixId        = req.headers['svix-id']        as string;
  const svixTimestamp = req.headers['svix-timestamp']  as string;
  const svixSignature = req.headers['svix-signature']  as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).json({ error: 'Missing svix headers' });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    const wh = new Webhook(secret);
    // req.body is the raw Buffer (see raw body middleware below)
    payload = wh.verify(req.body as Buffer, {
      'svix-id':        svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as Record<string, unknown>;
  } catch (err) {
    console.error('[Clerk Webhook] Signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  const eventType = payload.type as string;
  const data      = payload.data as Record<string, unknown>;

  try {
    const db = getDb();

    if (eventType === 'user.created' || eventType === 'user.updated') {
      const clerkUserId = data.id as string;
      const emails = (data.email_addresses as Array<{ id: string; email_address: string }>) ?? [];
      const primaryEmailId = data.primary_email_address_id as string | null;
      const primaryEmail =
        emails.find((e) => e.id === primaryEmailId)?.email_address
        ?? emails[0]?.email_address
        ?? '';

      const firstName  = (data.first_name as string | null) ?? '';
      const lastName   = (data.last_name  as string | null) ?? '';
      const username   = (data.username   as string | null) ?? '';
      const fullName   = [firstName, lastName].filter(Boolean).join(' ').trim()
                       || username
                       || primaryEmail;

      if (!primaryEmail) {
        console.warn('[Clerk Webhook] user has no email — skipping upsert:', clerkUserId);
        res.json({ received: true });
        return;
      }

      // Try to find existing user by clerkUserId or email
      const byClerkId = await db.query.users.findFirst({
        where: eq(schema.users.clerkUserId, clerkUserId),
      });

      if (byClerkId) {
        await db
          .update(schema.users)
          .set({ email: primaryEmail, name: fullName, updatedAt: new Date() })
          .where(eq(schema.users.id, byClerkId.id));
        console.log(`[Clerk Webhook] Updated user ${byClerkId.id} (${primaryEmail})`);
      } else {
        const inserted = await db
          .insert(schema.users)
          .values({ clerkUserId, email: primaryEmail, name: fullName, passwordHash: null })
          .onConflictDoUpdate({
            target: schema.users.email,
            set: { clerkUserId, name: fullName, updatedAt: new Date() },
          })
          .returning();
        console.log(`[Clerk Webhook] Created/linked user ${inserted[0]?.id} (${primaryEmail})`);
      }
    }

    if (eventType === 'user.deleted') {
      const clerkUserId = data.id as string;
      // Soft-delete: clear PII but keep referential integrity
      await db
        .update(schema.users)
        .set({
          clerkUserId: null,
          email: `deleted_${clerkUserId}@removed.invalid`,
          name: 'Deleted User',
          passwordHash: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.clerkUserId, clerkUserId));
      console.log(`[Clerk Webhook] Soft-deleted user with clerkUserId: ${clerkUserId}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Clerk Webhook] DB error:', err);
    res.status(500).json({ error: 'Internal error handling webhook' });
  }
});

export default router;
