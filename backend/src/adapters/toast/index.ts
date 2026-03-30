import axios from 'axios';
import type { MenuAdapter, MenuItem, PriceUpdate, BulkUpdateResult } from '../index';
import { checkRateLimit } from '../../lib/rateLimiter';

const TOAST_BASE = 'https://ws-api.toasttab.com';

export class ToastAdapter implements MenuAdapter {
  private clientId: string;
  private clientSecret: string;
  private restaurantGuid: string;
  private accessToken: string | null = null;

  constructor(
    private venueId: string,
    credentials: Record<string, unknown>
  ) {
    this.clientId = credentials.client_id as string;
    this.clientSecret = credentials.client_secret as string;
    this.restaurantGuid = credentials.restaurant_guid as string;
  }

  private async getToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    const resp = await axios.post(`${TOAST_BASE}/authentication/v1/authentication/login`, {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }, { timeout: 10000 });

    this.accessToken = resp.data.token.accessToken;
    return this.accessToken!;
  }

  private async checkLimit(): Promise<void> {
    const { allowed } = await checkRateLimit(`toast:${this.venueId}`, 300, 60);
    if (!allowed) throw new Error('Toast rate limit exceeded');
  }

  async testConnection(): Promise<boolean> {
    await this.checkLimit();
    try {
      const token = await this.getToken();
      await axios.get(`${TOAST_BASE}/restaurants/v1/restaurants/${this.restaurantGuid}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Toast-Restaurant-External-ID': this.restaurantGuid,
        },
        timeout: 8000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    await this.checkLimit();
    const token = await this.getToken();
    const resp = await axios.get(`${TOAST_BASE}/menus/v2/menus`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Toast-Restaurant-External-ID': this.restaurantGuid,
      },
      timeout: 15000,
    });

    const items: MenuItem[] = [];
    for (const menu of resp.data || []) {
      for (const group of menu.menuGroups || []) {
        for (const item of group.menuItems || []) {
          items.push({
            externalId: item.guid,
            name: item.name,
            category: group.name || 'Other',
            basePrice: Math.round((item.price || 0) * 100),
            currentPrice: Math.round((item.price || 0) * 100),
          });
        }
      }
    }
    return items;
  }

  async updateItemPrice(externalId: string, newPricePence: number): Promise<boolean> {
    await this.checkLimit();
    const token = await this.getToken();

    await axios.patch(
      `${TOAST_BASE}/config/v2/menuItems/${externalId}`,
      { price: newPricePence / 100 },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Toast-Restaurant-External-ID': this.restaurantGuid,
        },
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
      } catch (err) {
        errors.push(`${upd.externalId}: ${(err as Error).message}`);
      }
    }

    return { succeeded, failed: updates.length - succeeded, errors };
  }
}
