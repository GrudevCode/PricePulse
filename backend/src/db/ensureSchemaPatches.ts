import type { Pool } from 'pg';

/**
 * Idempotent DDL for columns that Drizzle expects but older DBs may lack.
 * Run once at process start so `npm run dev` survives a missed migration.
 */
export async function ensureSchemaPatches(pool: Pool): Promise<void> {
  await pool.query(`
    ALTER TABLE venues ADD COLUMN IF NOT EXISTS qr_menu_settings jsonb NOT NULL DEFAULT '{}'::jsonb
  `);
  await pool.query(`
    ALTER TABLE venues ADD COLUMN IF NOT EXISTS public_menu_style varchar(32) NOT NULL DEFAULT 'gourmet'
  `);
  await pool.query(`
    ALTER TABLE menus ADD COLUMN IF NOT EXISTS design_config jsonb
  `);
}
