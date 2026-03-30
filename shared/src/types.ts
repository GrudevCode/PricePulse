// ─── Enums ───────────────────────────────────────────────────────────────────

export type PricingMode = 'auto' | 'suggest' | 'manual';
export type MenuProvider = 'square' | 'toast' | 'lightspeed' | 'wix' | 'custom_api' | 'qr_only';
export type PricingDecisionMode = 'auto' | 'suggested' | 'manual_override';
export type WeatherCondition = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'heavy_rain' | 'snow' | 'fog' | 'windy';
export type TimePeriod = 'early_morning' | 'breakfast' | 'lunch' | 'afternoon' | 'dinner' | 'late_night';
export type ClaudeConfidence = 'high' | 'medium' | 'low';

// ─── Venue ───────────────────────────────────────────────────────────────────

export interface Venue {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  capacity: number;
  cuisineType: string;
  basePriceMultiplier: number;
  pricingMode: PricingMode;
  slug: string;
  brandColor?: string;
  createdAt: string;
}

// ─── Menu Integration ─────────────────────────────────────────────────────────

export interface MenuIntegration {
  id: string;
  venueId: string;
  provider: MenuProvider;
  lastSyncAt?: string;
  isActive: boolean;
  createdAt: string;
}

// ─── Menu Item ────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  venueId: string;
  externalId?: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  isDynamicPricingEnabled: boolean;
  minPrice: number;
  maxPrice: number;
  lastUpdatedAt: string;
}

// ─── Signals ──────────────────────────────────────────────────────────────────

export interface NearbyEvent {
  id: string;
  name: string;
  category: string;
  attendance?: number;
  distanceMetres: number;
  startsAt?: string;
  endsAt?: string;
  location?: string;
}

export interface NearbyVenue {
  id: string;
  name: string;
  type: string;
  isOpen: boolean;
  closesAt?: string;
  closesInMinutes?: number;
  priceLevel?: number;
  rating?: number;
}

export interface SignalSnapshot {
  id: string;
  venueId: string;
  capturedAt: string;
  timeOfDay: string;
  dayOfWeek: string;
  isPublicHoliday: boolean;
  weatherCondition: WeatherCondition;
  temperatureC: number;
  precipitationMm: number;
  period: TimePeriod;
  nearbyEvents: NearbyEvent[];
  nearbyVenuesOpen: NearbyVenue[];
  occupancyPct: number;
  demandScore: number;
}

// ─── Pricing Decision ─────────────────────────────────────────────────────────

export interface RecommendedPrice {
  itemId: string;
  newPricePence: number;
  changeReason: string;
}

export interface ClaudeRecommendation {
  overallMultiplier: number;
  confidence: ClaudeConfidence;
  reasoning: string;
  recommendedPrices: RecommendedPrice[];
  reviewAgainAt: string;
  alert?: string | null;
}

export interface PricingDecision {
  id: string;
  venueId: string;
  decidedAt: string;
  signalsSnapshot: SignalSnapshot;
  claudeReasoning: string;
  recommendedMultiplier: number;
  appliedMultiplier: number;
  itemsUpdated: number;
  mode: PricingDecisionMode;
  recommendation: ClaudeRecommendation;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  venue: Venue;
  currentSignals: SignalSnapshot;
  latestDecision?: PricingDecision;
  estimatedRevenueImpact: number;
  totalItemsDynamic: number;
  avgMultiplierToday: number;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export interface WsPricingDecision {
  venueId: string;
  decision: PricingDecision;
}

export interface WsSignalUpdate {
  venueId: string;
  signals: SignalSnapshot;
}

export interface WsOccupancyUpdate {
  venueId: string;
  occupancyPct: number;
}

export interface WsPricingApplied {
  venueId: string;
  decisionId: string;
  itemsUpdated: number;
}

export interface WsPricingFailed {
  venueId: string;
  decisionId: string;
  error: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}
