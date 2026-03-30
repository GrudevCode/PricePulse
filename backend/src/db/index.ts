import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type DbSchema = typeof schema;

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<DbSchema>> | null = null;

export function getDb() {
  if (!db) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle<DbSchema>(pool, { schema });
  }
  return db;
}

export function getPool(): Pool {
  if (!pool) getDb();
  return pool!;
}

export { schema };
