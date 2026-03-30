import axios, { AxiosRequestConfig } from 'axios';
import type { MenuAdapter, MenuItem, PriceUpdate, BulkUpdateResult } from '../index';

interface FieldMapping {
  price_field: string;
  id_field: string;
  name_field?: string;
  category_field?: string;
  currency_unit: 'pence' | 'decimal';
}

interface CustomCredentials {
  base_url: string;
  auth_type: 'bearer' | 'basic' | 'api_key_header';
  auth_value: string;
  auth_header?: string;
  get_endpoint: string;
  update_endpoint: string;
  field_mapping: FieldMapping;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export class CustomApiAdapter implements MenuAdapter {
  private config: CustomCredentials;

  constructor(
    private venueId: string,
    credentials: Record<string, unknown>
  ) {
    this.config = credentials as unknown as CustomCredentials;
  }

  private getAuthHeaders(): Record<string, string> {
    const { auth_type, auth_value, auth_header } = this.config;
    if (auth_type === 'bearer') return { Authorization: `Bearer ${auth_value}` };
    if (auth_type === 'basic') return { Authorization: `Basic ${Buffer.from(auth_value).toString('base64')}` };
    if (auth_type === 'api_key_header') return { [auth_header || 'X-API-Key']: auth_value };
    return {};
  }

  async testConnection(): Promise<boolean> {
    try {
      const config: AxiosRequestConfig = {
        headers: this.getAuthHeaders(),
        timeout: 8000,
      };
      await axios.get(`${this.config.base_url}${this.config.get_endpoint}`, config);
      return true;
    } catch {
      return false;
    }
  }

  async fetchMenuItems(): Promise<MenuItem[]> {
    const resp = await axios.get(
      `${this.config.base_url}${this.config.get_endpoint}`,
      { headers: this.getAuthHeaders(), timeout: 15000 }
    );

    const mapping = this.config.field_mapping;
    const rawItems = Array.isArray(resp.data) ? resp.data : resp.data.items || resp.data.data || [];

    return rawItems.map((item: Record<string, unknown>) => {
      const rawPrice = getNestedValue(item, mapping.price_field) as number;
      const price = mapping.currency_unit === 'decimal' ? Math.round(rawPrice * 100) : rawPrice;

      return {
        externalId: String(getNestedValue(item, mapping.id_field) || ''),
        name: String(getNestedValue(item, mapping.name_field || 'name') || 'Unknown'),
        category: String(getNestedValue(item, mapping.category_field || 'category') || 'Other'),
        basePrice: price,
        currentPrice: price,
      };
    });
  }

  async updateItemPrice(externalId: string, newPricePence: number): Promise<boolean> {
    const mapping = this.config.field_mapping;
    const priceValue = mapping.currency_unit === 'decimal' ? newPricePence / 100 : newPricePence;

    const endpoint = this.config.update_endpoint.replace(':id', externalId);
    const body: Record<string, unknown> = {};

    // Set nested field
    const parts = mapping.price_field.split('.');
    let current = body;
    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] = {};
      current = current[parts[i]] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = priceValue;

    await axios.patch(
      `${this.config.base_url}${endpoint}`,
      body,
      { headers: this.getAuthHeaders(), timeout: 8000 }
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
