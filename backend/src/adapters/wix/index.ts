import axios from 'axios';
import type { MenuAdapter, MenuItem, PriceUpdate, BulkUpdateResult } from '../index';

const WIX_BASE = 'https://www.wixapis.com/restaurants/v1';

export class WixAdapter implements MenuAdapter {
  private apiKey: string;
  private siteId: string;

  constructor(
    private venueId: string,
    credentials: Record<string, unknown>
  ) {
    this.apiKey = credentials.api_key as string;
    this.siteId = credentials.site_id as string;
  }

  private headers() {
    return {
      Authorization: this.apiKey,
      'wix-site-id': this.siteId,
    };
  }

  async testConnection(): Promise<boolean> {
    try {
      await axios.get(`${WIX_BASE}/menus`, { headers: this.headers(), timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    const resp = await axios.get(`${WIX_BASE}/menus`, {
      headers: this.headers(),
      timeout: 15000,
    });

    const items: MenuItem[] = [];
    for (const menu of resp.data.menus || []) {
      for (const section of menu.sections || []) {
        for (const item of section.items || []) {
          const price = parseFloat(item.price || '0');
          items.push({
            externalId: item.id,
            name: item.name,
            category: section.title || 'Other',
            basePrice: Math.round(price * 100),
            currentPrice: Math.round(price * 100),
          });
        }
      }
    }
    return items;
  }

  async updateItemPrice(externalId: string, newPricePence: number): Promise<boolean> {
    await axios.patch(
      `${WIX_BASE}/items/${externalId}`,
      { item: { price: (newPricePence / 100).toFixed(2) } },
      { headers: this.headers(), timeout: 8000 }
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
      } catch (err) {
        errors.push(`${upd.externalId}: ${(err as Error).message}`);
      }
    }

    return { succeeded, failed: updates.length - succeeded, errors };
  }
}
