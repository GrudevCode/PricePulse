import type { MenuProvider } from '@pricepulse/shared';
import { QrOnlyAdapter } from './qronly';
import { SquareAdapter } from './square';
import { ToastAdapter } from './toast';
import { LightspeedAdapter } from './lightspeed';
import { WixAdapter } from './wix';
import { CustomApiAdapter } from './custom';

export interface MenuItem {
  externalId?: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
}

export interface PriceUpdate {
  externalId: string;
  newPricePence: number;
}

export interface BulkUpdateResult {
  succeeded: number;
  failed: number;
  errors: string[];
}

export interface OccupancyUpdate {
  occupancyPct: number;
}

export interface MenuAdapter {
  testConnection(): Promise<boolean>;
  fetchMenuItems(): Promise<MenuItem[]>;
  updateItemPrice(externalId: string, newPricePence: number): Promise<boolean>;
  bulkUpdatePrices(updates: PriceUpdate[]): Promise<BulkUpdateResult>;
  getWebhookPayload?(raw: unknown): OccupancyUpdate | null;
}

export function getAdapterForProvider(
  provider: MenuProvider,
  venueId: string,
  credentials: Record<string, unknown>
): MenuAdapter {
  switch (provider) {
    case 'square': return new SquareAdapter(venueId, credentials);
    case 'toast': return new ToastAdapter(venueId, credentials);
    case 'lightspeed': return new LightspeedAdapter(venueId, credentials);
    case 'wix': return new WixAdapter(venueId, credentials);
    case 'custom_api': return new CustomApiAdapter(venueId, credentials);
    case 'qr_only': return new QrOnlyAdapter(venueId, credentials);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}
