import { Request, Response, NextFunction } from 'express';
import { verifyToken, createClerkClient } from '@clerk/backend';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function upsertUserFromClerk(clerkUserId: string, email: string, name: string) {
  const db = getDb();

  const byClerkId = await db.query.users.findFirst({
    where: eq(schema.users.clerkUserId, clerkUserId),
  });
  if (byClerkId) {
    if (byClerkId.email !== email || byClerkId.name !== name) {
      await db
        .update(schema.users)
        .set({ email, name, updatedAt: new Date() })
        .where(eq(schema.users.id, byClerkId.id));
    }
    return byClerkId;
  }

  // Migrate existing email-based user → link clerkUserId
  const byEmail = await db
    .select()
    .from(schema.users)
    .where(sql`lower(trim(${schema.users.email})) = ${email.toLowerCase()}`)
    .limit(1);

  if (byEmail[0]) {
    await db
      .update(schema.users)
      .set({ clerkUserId, name, updatedAt: new Date() })
      .where(eq(schema.users.id, byEmail[0].id));
    return { ...byEmail[0], clerkUserId };
  }

  const inserted = await db
    .insert(schema.users)
    .values({ clerkUserId, email, name, passwordHash: null })
    .returning();
  return inserted[0];
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const claims      = verified as Record<string, unknown>;
    const clerkUserId = typeof claims.sub === 'string' ? claims.sub : undefined;

    if (!clerkUserId) {
      res.status(401).json({ success: false, error: 'Invalid token claims' });
      return;
    }

    const clerkUser       = await clerkClient.users.getUser(clerkUserId);
    const primaryEmailId  = clerkUser.primaryEmailAddressId;
    const primaryEmail    =
      clerkUser.emailAddresses.find((e) => e.id === primaryEmailId)?.emailAddress
      ?? clerkUser.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      res.status(401).json({ success: false, error: 'Clerk user has no email address' });
      return;
    }

    const fullName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
      || clerkUser.username
      || primaryEmail;

    const user    = await upsertUserFromClerk(clerkUserId, primaryEmail, fullName);
    req.userId    = user.id;
    req.userEmail = user.email;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
