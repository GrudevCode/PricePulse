import axios from 'axios';
import type { MenuAdapter, MenuItem, PriceUpdate, BulkUpdateResult } from '../index';
import { checkRateLimit } from '../../lib/rateLimiter';

const SQUARE_BASE = 'https://connect.squareup.com/v2';

export class SquareAdapter implements MenuAdapter {
  private token: string;

  constructor(
    private venueId: string,
    credentials: Record<string, unknown>
  ) {
    this.token = credentials.access_token as string;
  }

  private async checkLimit(): Promise<void> {
    const { allowed } = await checkRateLimit(`square:${this.venueId}`, 100, 60);
    if (!allowed) throw new Error('Square rate limit exceeded');
  }

  async testConnection(): Promise<boolean> {
    await this.checkLimit();
    try {
      await axios.get(`${SQUARE_BASE}/merchants/me`, {
        headers: { Authorization: `Bearer ${this.token}`, 'Square-Version': '2024-01-17' },
        timeout: 8000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    await this.checkLimit();
    const resp = await axios.get(`${SQUARE_BASE}/catalog/list`, {
      headers: { Authorization: `Bearer ${this.token}`, 'Square-Version': '2024-01-17' },
      params: { types: 'ITEM' },
      timeout: 15000,
    });

    const items: MenuItem[] = [];
    for (const obj of resp.data.objects || []) {
      if (obj.type !== 'ITEM') continue;
      const itemData = obj.item_data;
      for (const variation of itemData?.variations || []) {
        const price = variation.item_variation_data?.price_money?.amount || 0;
        items.push({
          externalId: variation.id,
          name: `${itemData.name} — ${variation.item_variation_data?.name || 'Regular'}`,
          category: itemData.category?.name || 'Other',
          basePrice: price,
          currentPrice: price,
        });
      }
    }
    return items;
  }

  async updateItemPrice(externalId: string, newPricePence: number): Promise<boolean> {
    await this.checkLimit();

    // First get current object to get version
    const getResp = await axios.get(`${SQUARE_BASE}/catalog/object/${externalId}`, {
      headers: { Authorization: `Bearer ${this.token}`, 'Square-Version': '2024-01-17' },
      timeout: 8000,
    });

    const obj = getResp.data.object;
    const version = obj.version;

    await axios.put(
      `${SQUARE_BASE}/catalog/object/${externalId}`,
      {
        idempotency_key: `${externalId}-${Date.now()}`,
        object: {
          type: 'ITEM_VARIATION',
          id: externalId,
          version,
          item_variation_data: {
            price_money: {
              amount: newPricePence,
              currency: 'GBP',
            },
          },
        },
      },
      {
        headers: { Authorization: `Bearer ${this.token}`, 'Square-Version': '2024-01-17' },
        timeout: 8000,
      }
    );

    return true;
  }

  async bulkUpdatePrices(updates: PriceUpdate[]): Promise<BulkUpdateResult> {
    let succeeded = 0;
    const errors: string[] = [];

    for (const upd of updates) {
      try {
        await this.updateItemPrice(upd.externalId, upd.newPricePence);
        succeeded++;
        await new Promise((r) => setTimeout(r, 100)); // respect rate limit
      } catch (err) {
        errors.push(`${upd.externalId}: ${(err as Error).message}`);
      }
    }

    return { succeeded, failed: updates.length - succeeded, errors };
  }
}
