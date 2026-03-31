import {
  pgTable,
  text,
  varchar,
  decimal,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uuid,
  index,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const pricingModeEnum = pgEnum('pricing_mode', ['auto', 'suggest', 'manual']);
export const menuProviderEnum = pgEnum('menu_provider', [
  'square', 'toast', 'lightspeed', 'wix', 'custom_api', 'qr_only',
]);
export const pricingDecisionModeEnum = pgEnum('pricing_decision_mode', [
  'auto', 'suggested', 'manual_override',
]);
export const bookingStatusEnum = pgEnum('booking_status', [
  'confirmed', 'pending', 'seated', 'completed', 'cancelled', 'no-show',
]);
export const tableStatusEnum = pgEnum('table_status', [
  'available', 'occupied', 'reserved', 'cleaning',
]);
export const orderStatusEnum = pgEnum('order_status', [
  'new', 'preparing', 'served', 'paid', 'cancelled',
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkUserId: varchar('clerk_user_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Venues ───────────────────────────────────────────────────────────────────

export const venues = pgTable('venues', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address').notNull(),
  lat: decimal('lat', { precision: 10, scale: 7 }).notNull(),
  lng: decimal('lng', { precision: 10, scale: 7 }).notNull(),
  capacity: integer('capacity').notNull().default(100),
  cuisineType: varchar('cuisine_type', { length: 100 }).notNull().default('bar'),
  basePriceMultiplier: decimal('base_price_multiplier', { precision: 4, scale: 2 }).notNull().default('1.00'),
  pricingMode: pricingModeEnum('pricing_mode').notNull().default('suggest'),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  brandColor: varchar('brand_color', { length: 7 }),
  competitorNotes: text('competitor_notes'),
  currentOccupancyPct: integer('current_occupancy_pct').notNull().default(0),
  /** QR public menu: menus pool, optional schedule + fallback (see @pricepulse/shared qrMenu) */
  qrMenuSettings: jsonb('qr_menu_settings').notNull().default({}),
  /** Guest menu + dashboard preview theme: gourmet (fine dining) | fast_food (placeholder layout) */
  publicMenuStyle: varchar('public_menu_style', { length: 32 }).notNull().default('gourmet'),
  /** Cleaning timer duration in minutes (default 15) for auto table status lifecycle */
  cleaningTimerMinutes: integer('cleaning_timer_minutes').notNull().default(15),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('venues_user_id_idx').on(table.userId),
  slugIdx: index('venues_slug_idx').on(table.slug),
}));

// ─── Menu Integrations ────────────────────────────────────────────────────────

export const menuIntegrations = pgTable('menu_integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  provider: menuProviderEnum('provider').notNull(),
  credentialsEncrypted: jsonb('credentials_encrypted'),
  lastSyncAt: timestamp('last_sync_at'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('menu_integrations_venue_id_idx').on(table.venueId),
}));

// ─── Menus ────────────────────────────────────────────────────────────────────

export const menus = pgTable('menus', {
  id:           uuid('id').defaultRandom().primaryKey(),
  venueId:      uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name:         varchar('name', { length: 255 }).notNull(),
  description:  text('description'),
  isActive:     boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  scheduleJson: jsonb('schedule_json').notNull().default([]),
  color:        varchar('color', { length: 7 }).default('#6366f1'),
  designConfig: jsonb('design_config'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('menus_venue_id_idx').on(table.venueId),
}));

// ─── Menu Categories ──────────────────────────────────────────────────────────

export const menuCategories = pgTable('menu_categories', {
  id:           uuid('id').defaultRandom().primaryKey(),
  menuId:       uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  name:         varchar('name', { length: 255 }).notNull(),
  description:  text('description'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  menuIdIdx: index('menu_categories_menu_id_idx').on(table.menuId),
}));

// ─── Menu Items ───────────────────────────────────────────────────────────────

export const menuItems = pgTable('menu_items', {
  id:                      uuid('id').defaultRandom().primaryKey(),
  venueId:                 uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  categoryId:              uuid('category_id').references(() => menuCategories.id, { onDelete: 'set null' }),
  externalId:              varchar('external_id', { length: 255 }),
  name:                    varchar('name', { length: 255 }).notNull(),
  category:                varchar('category', { length: 100 }).notNull().default('Other'), // legacy flat field
  basePrice:               integer('base_price').notNull(),
  currentPrice:            integer('current_price').notNull(),
  isDynamicPricingEnabled: boolean('is_dynamic_pricing_enabled').notNull().default(true),
  minPrice:                integer('min_price').notNull(),
  maxPrice:                integer('max_price').notNull(),
  description:             text('description'),
  imageUrl:                text('image_url'),
  displayOrder:            integer('display_order').notNull().default(0),
  isAvailable:             boolean('is_available').notNull().default(true),
  /** When true, out-of-stock from linked ingredients hides item in editor preview & public menu */
  intelligentInventorySync: boolean('intelligent_inventory_sync').notNull().default(false),
  lastUpdatedAt:           timestamp('last_updated_at').defaultNow().notNull(),
  createdAt:               timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx:    index('menu_items_venue_id_idx').on(table.venueId),
  categoryIdIdx: index('menu_items_category_id_idx').on(table.categoryId),
  categoryIdx:   index('menu_items_category_idx').on(table.venueId, table.category),
}));

// ─── Product Ingredients ──────────────────────────────────────────────────────

export const productIngredients = pgTable('product_ingredients', {
  id:              uuid('id').defaultRandom().primaryKey(),
  productId:       uuid('product_id').notNull().references(() => menuItems.id, { onDelete: 'cascade' }),
  /** Optional link to an inventory item — when set, cost auto-calculates from inventory price × qty */
  inventoryItemId: uuid('inventory_item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
  name:            varchar('name', { length: 255 }).notNull(),
  quantity:        decimal('quantity', { precision: 10, scale: 3 }).notNull().default('0'),
  unit:            varchar('unit', { length: 50 }).notNull().default('g'),
  costPence:       integer('cost_pence').notNull().default(0),
  displayOrder:    integer('display_order').notNull().default(0),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  productIdIdx:     index('product_ingredients_product_id_idx').on(table.productId),
  inventoryItemIdx: index('product_ingredients_inventory_item_id_idx').on(table.inventoryItemId),
}));

// ─── Relations ────────────────────────────────────────────────────────────────

export const menusRelations = relations(menus, ({ one, many }) => ({
  venue:      one(venues,         { fields: [menus.venueId],      references: [venues.id] }),
  categories: many(menuCategories),
}));

export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  menu:  one(menus,     { fields: [menuCategories.menuId], references: [menus.id] }),
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  venue:       one(venues,          { fields: [menuItems.venueId],    references: [venues.id] }),
  category:    one(menuCategories,  { fields: [menuItems.categoryId], references: [menuCategories.id] }),
  ingredients: many(productIngredients),
}));

export const productIngredientsRelations = relations(productIngredients, ({ one }) => ({
  product: one(menuItems, { fields: [productIngredients.productId], references: [menuItems.id] }),
}));

// ─── Signal Snapshots ─────────────────────────────────────────────────────────

export const signalSnapshots = pgTable('signal_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  timeOfDay: varchar('time_of_day', { length: 8 }).notNull(),
  dayOfWeek: varchar('day_of_week', { length: 10 }).notNull(),
  isPublicHoliday: boolean('is_public_holiday').notNull().default(false),
  weatherCondition: varchar('weather_condition', { length: 20 }).notNull().default('clear'),
  temperatureC: decimal('temperature_c', { precision: 5, scale: 2 }).notNull().default('15'),
  precipitationMm: decimal('precipitation_mm', { precision: 5, scale: 2 }).notNull().default('0'),
  period: varchar('period', { length: 20 }).notNull().default('afternoon'),
  nearbyEvents: jsonb('nearby_events').notNull().default([]),
  nearbyVenuesOpen: jsonb('nearby_venues_open').notNull().default([]),
  occupancyPct: integer('occupancy_pct').notNull().default(0),
  demandScore: integer('demand_score').notNull().default(50),
  rawWeatherData: jsonb('raw_weather_data'),
  staleSignals: jsonb('stale_signals').notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('signal_snapshots_venue_id_idx').on(table.venueId),
  capturedAtIdx: index('signal_snapshots_captured_at_idx').on(table.venueId, table.capturedAt),
}));

// ─── Pricing Decisions ────────────────────────────────────────────────────────

export const pricingDecisions = pgTable('pricing_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  decidedAt: timestamp('decided_at').defaultNow().notNull(),
  signalsSnapshot: jsonb('signals_snapshot').notNull(),
  claudeReasoning: text('claude_reasoning').notNull(),
  recommendedMultiplier: decimal('recommended_multiplier', { precision: 4, scale: 2 }).notNull(),
  appliedMultiplier: decimal('applied_multiplier', { precision: 4, scale: 2 }),
  itemsUpdated: integer('items_updated').notNull().default(0),
  mode: pricingDecisionModeEnum('mode').notNull().default('suggested'),
  recommendation: jsonb('recommendation').notNull(),
  isApproved: boolean('is_approved'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('pricing_decisions_venue_id_idx').on(table.venueId),
  decidedAtIdx: index('pricing_decisions_decided_at_idx').on(table.venueId, table.decidedAt),
}));

// ─── Venue Calendar Schedule ──────────────────────────────────────────────────

export const venueSchedule = pgTable('venue_schedule', {
  id:           uuid('id').defaultRandom().primaryKey(),
  venueId:      uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  scheduleDate: date('schedule_date').notNull(),
  menuId:       uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  /** From each HH:mm (24h, Europe/London, inclusive) use menuId for the rest of that calendar day. */
  timeSwitches: jsonb('time_switches').notNull().default([]),
  createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  venueIdIdx:      index('venue_schedule_venue_id_idx').on(table.venueId),
  dateIdx:         index('venue_schedule_date_idx').on(table.scheduleDate),
  uniqueVenueDate: uniqueIndex('venue_schedule_venue_date_uidx').on(table.venueId, table.scheduleDate),
}));

// ─── Venue Tables ──────────────────────────────────────────────────────────────

export const venueTables = pgTable('venue_tables', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  number: varchar('number', { length: 50 }).notNull(),
  section: varchar('section', { length: 100 }).notNull(),
  capacity: integer('capacity').notNull().default(2),
  shape: varchar('shape', { length: 20 }).notNull().default('round'),
  x: integer('x').notNull().default(0),
  y: integer('y').notNull().default(0),
  w: integer('w'),
  h: integer('h'),
  status: tableStatusEnum('status').notNull().default('available'),
  /** Per-table auto status lifecycle toggle */
  autoStatus: boolean('auto_status').notNull().default(false),
  /** When the table entered cleaning status (for countdown timer) */
  cleaningStartedAt: timestamp('cleaning_started_at'),
  color: varchar('color', { length: 7 }),
  notes: text('notes'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('venue_tables_venue_id_idx').on(table.venueId),
  venueNumberUidx: uniqueIndex('venue_tables_venue_number_uidx').on(table.venueId, table.number),
}));

// ─── Table Bookings ────────────────────────────────────────────────────────────

export const tableBookings = pgTable('table_bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').references(() => venueTables.id, { onDelete: 'set null' }),
  tableNumber: varchar('table_number', { length: 50 }).notNull(),
  section: varchar('section', { length: 100 }).notNull(),
  guestName: varchar('guest_name', { length: 255 }).notNull(),
  partySize: integer('party_size').notNull().default(2),
  bookingDate: date('booking_date').notNull(),
  startTime: varchar('start_time', { length: 5 }).notNull(),
  duration: integer('duration').notNull().default(90),
  status: bookingStatusEnum('status').notNull().default('confirmed'),
  notes: text('notes'),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('table_bookings_venue_id_idx').on(table.venueId),
  tableIdIdx: index('table_bookings_table_id_idx').on(table.tableId),
  dateIdx: index('table_bookings_date_idx').on(table.bookingDate),
  venueDateIdx: index('table_bookings_venue_date_idx').on(table.venueId, table.bookingDate),
}));

// ─── Inventory Items ───────────────────────────────────────────────────────────

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  onHand: integer('on_hand').notNull().default(0),
  parLevel: integer('par_level').notNull().default(0),
  unit: varchar('unit', { length: 100 }).notNull(),
  unitCostPence: integer('unit_cost_pence').notNull().default(0),
  velocityPerNight: decimal('velocity_per_night', { precision: 10, scale: 2 }).notNull().default('0'),
  status: varchar('status', { length: 20 }).notNull().default('ok'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('inventory_items_venue_id_idx').on(table.venueId),
  venueCategoryIdx: index('inventory_items_venue_category_idx').on(table.venueId, table.category),
}));

export const inventorySections = pgTable('inventory_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('inventory_sections_venue_id_idx').on(table.venueId),
  venueNameUidx: uniqueIndex('inventory_sections_venue_name_uidx').on(table.venueId, table.name),
}));

// ─── Orders ────────────────────────────────────────────────────────────────────

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  tableNumber: varchar('table_number', { length: 50 }),
  customerName: varchar('customer_name', { length: 255 }),
  covers: integer('covers').notNull().default(1),
  status: orderStatusEnum('status').notNull().default('new'),
  totalPence: integer('total_pence').notNull().default(0),
  notes: text('notes'),
  orderedAt: timestamp('ordered_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  venueIdIdx: index('orders_venue_id_idx').on(table.venueId),
  orderedAtIdx: index('orders_ordered_at_idx').on(table.venueId, table.orderedAt),
}));

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  qty: integer('qty').notNull().default(1),
  unitPricePence: integer('unit_price_pence').notNull().default(0),
  lineTotalPence: integer('line_total_pence').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index('order_items_order_id_idx').on(table.orderId),
}));
