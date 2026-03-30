import type { MenuAdapter, MenuItem, PriceUpdate, BulkUpdateResult } from '../index';
import { getDb, schema } from '../../db';
import { eq } from 'drizzle-orm';

export class QrOnlyAdapter implements MenuAdapter {
  constructor(
    private venueId: string,
    private credentials: Record<string, unknown>
  ) {}

  async testConnection(): Promise<boolean> {
    return true;
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    const db = getDb();
    const items = await db.query.menuItems.findMany({
      where: eq(schema.menuItems.venueId, this.venueId),
    });
    return items.map((item: typeof schema.menuItems.$inferSelect) => ({
      externalId: item.id,
      name: item.name,
      category: item.category,
      basePrice: item.basePrice,
      currentPrice: item.currentPrice,
    }));
  }

  async updateItemPrice(itemId: string, newPricePence: number): Promise<boolean> {
    const db = getDb();
    await db.update(schema.menuItems)
      .set({ currentPrice: newPricePence, lastUpdatedAt: new Date() })
      .where(eq(schema.menuItems.id, itemId));
    return true;
  }

  async bulkUpdatePrices(updates: PriceUpdate[]): Promise<BulkUpdateResult> {
    const db = getDb();
    let succeeded = 0;
    const errors: string[] = [];

    for (const upd of updates) {
      try {
        await db.update(schema.menuItems)
          .set({ currentPrice: upd.newPricePence, lastUpdatedAt: new Date() })
          .where(eq(schema.menuItems.id, upd.externalId));
        succeeded++;
      } catch (err) {
        errors.push(`Failed to update ${upd.externalId}: ${(err as Error).message}`);
      }
    }

    return { succeeded, failed: updates.length - succeeded, errors };
  }
}
