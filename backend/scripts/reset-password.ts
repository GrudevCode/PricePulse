/**
 * Set a new password for an existing user (case-insensitive email match).
 * Requires DATABASE_URL (e.g. from backend/.env).
 *
 *   cd backend && npx tsx scripts/reset-password.ts you@example.com 'NewPassWord12'
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../src/db';

async function main() {
  const emailArg = process.argv[2];
  const passwordArg = process.argv[3];
  if (!emailArg || !passwordArg) {
    console.error('Usage: npx tsx scripts/reset-password.ts <email> <new-password>');
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if (passwordArg.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const normalized = emailArg.trim().toLowerCase();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to backend/.env or the environment.');
    process.exit(1);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(sql`lower(trim(${schema.users.email})) = ${normalized}`)
    .limit(1);
  const user = rows[0];
  if (!user) {
    console.error(`No user found matching email "${normalized}". Check DATABASE_URL points at the database where you registered.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(passwordArg, 12);
  await db
    .update(schema.users)
    .set({ passwordHash, email: normalized, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  console.log(`Password updated for ${normalized} (user id ${user.id}). You can log in with this email and the new password.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
