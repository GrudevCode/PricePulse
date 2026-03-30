import axios from 'axios';
import type { MenuAdapter, MenuItem, PriceUpdate, BulkUpdateResult } from '../index';
import { checkRateLimit } from '../../lib/rateLimiter';

const LS_BASE = 'https://api.lightspeedapp.com';

export class LightspeedAdapter implements MenuAdapter {
  private accessToken: string;
  private accountId: string;

  constructor(
    private venueId: string,
    credentials: Record<string, unknown>
  ) {
    this.accessToken = credentials.access_token as string;
    this.accountId = credentials.account_id as string;
  }

  private async checkLimit(): Promise<void> {
    const { allowed } = await checkRateLimit(`lightspeed:${this.venueId}`, 60, 60);
    if (!allowed) throw new Error('Lightspeed rate limit exceeded');
  }

  async testConnection(): Promise<boolean> {
    await this.checkLimit();
    try {
      await axios.get(`${LS_BASE}/API/Account/${this.accountId}.json`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        timeout: 8000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    await this.checkLimit();
    const resp = await axios.get(
      `${LS_BASE}/API/Account/${this.accountId}/Item.json`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        params: { load_relations: '["Category","Prices"]', limit: 200 },
        timeout: 15000,
      }
    );

    const items: MenuItem[] = [];
    for (const item of resp.data.Item || []) {
      const price = parseFloat(
        item.Prices?.ItemPrice?.find((p: { useType: string }) => p.useType === 'Default')?.amount || '0'
      );
      items.push({
        externalId: String(item.itemID),
        name: item.description,
        category: item.Category?.name || 'Other',
        basePrice: Math.round(price * 100),
        currentPrice: Math.round(price * 100),
      });
    }
    return items;
  }

  async updateItemPrice(externalId: string, newPricePence: number): Promise<boolean> {
    await this.checkLimit();

    await axios.put(
      `${LS_BASE}/API/Account/${this.accountId}/Item/${externalId}.json`,
      {
        Item: {
          Prices: {
            ItemPrice: [{ amount: (newPricePence / 100).toFixed(2), useType: 'Default' }],
          },
        },
      },
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
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
        await new Promise((r) => setTimeout(r, 1100)); // 60 req/min = ~1 per second
      } catch (err) {
        errors.push(`${upd.externalId}: ${(err as Error).message}`);
      }
    }

    return { succeeded, failed: updates.length - succeeded, errors };
  }
}
