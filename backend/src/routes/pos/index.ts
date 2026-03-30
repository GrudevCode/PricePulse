import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { getPool } from '../../db';
import { getIo } from '../../lib/socket';
import { convertToInventoryUnit, UNIT_CONVERT_SQL } from '../../lib/unitConversion';

const router = Router({ mergeParams: true });

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const configUpdateSchema = z.object({
  defaultTaxRate: z.number().min(0).max(100).optional(),
  serviceChargeRate: z.number().min(0).max(100).optional(),
  serviceChargeEnabled: z.boolean().optional(),
  autoCloseOnFullPayment: z.boolean().optional(),
  requireClockIn: z.boolean().optional(),
  receiptHeader: z.string().max(500).optional().nullable(),
  receiptFooter: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).optional(),
  ticketPrefix: z.string().max(10).optional(),
}).strict();

const openSessionSchema = z.object({
  openingFloat: z.number().int().min(0).default(0),
  staffName: z.string().min(1).max(255),
  notes: z.string().max(2000).optional().nullable(),
});

const closeSessionSchema = z.object({
  closingNotes: z.string().max(2000).optional().nullable(),
  countedCashPence: z.number().int().min(0).optional(),
});

const createTicketSchema = z.object({
  tableNumber: z.string().max(50).optional().nullable(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  covers: z.number().int().positive().max(100).default(1),
  notes: z.string().max(2000).optional().nullable(),
  ticketType: z.enum(['dine_in', 'takeaway', 'delivery', 'bar_tab']).default('dine_in'),
});

const updateTicketSchema = z.object({
  tableNumber: z.string().max(50).optional().nullable(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  covers: z.number().int().positive().max(100).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const ticketItemSchema = z.object({
  menuItemId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  qty: z.number().int().positive().max(999),
  unitPricePence: z.number().int().min(0),
  modifierPence: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const addItemsSchema = z.object({
  items: z.array(ticketItemSchema).min(1).max(100),
});

const updateItemSchema = z.object({
  qty: z.number().int().positive().max(999).optional(),
  notes: z.string().max(500).optional().nullable(),
});

const paymentSchema = z.object({
  method: z.enum(['cash', 'card', 'contactless', 'apple_pay', 'google_pay', 'voucher', 'other']),
  amountPence: z.number().int().positive(),
  tipPence: z.number().int().min(0).default(0),
  idempotencyKey: z.string().min(1).max(255),
  reference: z.string().max(255).optional().nullable(),
});

const refundSchema = z.object({
  amountPence: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

const splitByAmountSchema = z.object({
  type: z.literal('by_amount'),
  amounts: z.array(z.number().int().positive()).min(2),
});

const splitByItemsSchema = z.object({
  type: z.literal('by_items'),
  groups: z.array(z.array(z.string().uuid()).min(1)).min(2),
});

const splitSchema = z.discriminatedUnion('type', [splitByAmountSchema, splitByItemsSchema]);

const discountSchema = z.object({
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive(),
  reason: z.string().max(500).optional().nullable(),
});

const voidTicketSchema = z.object({
  reason: z.string().min(1).max(500),
});

// ─── Helper Functions ────────────────────────────────────────────────────────

async function logAudit(
  venueId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO pos_audit_log (id, venue_id, user_id, action, entity_type, entity_id, details, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
    [venueId, userId, action, entityType, entityId, JSON.stringify(details)],
  );
}

async function recalcTicketTotals(ticketId: string): Promise<{
  subtotalPence: number;
  taxPence: number;
  serviceChargePence: number;
  discountPence: number;
  totalPence: number;
}> {
  const pool = getPool();

  // Sum non-voided items
  const itemsResult = await pool.query(
    `SELECT COALESCE(SUM((qty * unit_price_pence) + COALESCE(modifier_pence, 0) * qty), 0)::int AS subtotal
     FROM pos_ticket_items
     WHERE ticket_id = $1 AND voided = false`,
    [ticketId],
  );
  const subtotalPence = itemsResult.rows[0]?.subtotal ?? 0;

  // Get ticket's venue for config
  const ticketResult = await pool.query(
    `SELECT venue_id, discount_type, discount_value FROM pos_tickets WHERE id = $1`,
    [ticketId],
  );
  if (!ticketResult.rows[0]) {
    return { subtotalPence: 0, taxPence: 0, serviceChargePence: 0, discountPence: 0, totalPence: 0 };
  }
  const ticket = ticketResult.rows[0];

  // Get POS config for tax and service charge rates
  const configResult = await pool.query(
    `SELECT default_tax_rate, service_charge_rate, service_charge_enabled FROM pos_config WHERE venue_id = $1`,
    [ticket.venue_id],
  );
  const config = configResult.rows[0] ?? { default_tax_rate: 20, service_charge_rate: 0, service_charge_enabled: false };
  const taxRate = parseFloat(config.default_tax_rate) || 0;
  const serviceChargeRate = config.service_charge_enabled ? (parseFloat(config.service_charge_rate) || 0) : 0;

  // Calculate discount
  let discountPence = 0;
  if (ticket.discount_type === 'percentage' && ticket.discount_value > 0) {
    discountPence = Math.round(subtotalPence * ticket.discount_value / 100);
  } else if (ticket.discount_type === 'fixed' && ticket.discount_value > 0) {
    discountPence = Math.min(ticket.discount_value, subtotalPence);
  }

  const afterDiscount = subtotalPence - discountPence;
  const taxPence = Math.round(afterDiscount * taxRate / 100);
  const serviceChargePence = Math.round(afterDiscount * serviceChargeRate / 100);
  const totalPence = afterDiscount + taxPence + serviceChargePence;

  // Update the ticket
  await pool.query(
    `UPDATE pos_tickets
     SET subtotal_pence = $2, tax_pence = $3, service_charge_pence = $4,
         discount_pence = $5, total_pence = $6, updated_at = NOW()
     WHERE id = $1`,
    [ticketId, subtotalPence, taxPence, serviceChargePence, discountPence, totalPence],
  );

  return { subtotalPence, taxPence, serviceChargePence, discountPence, totalPence };
}

async function resolveBookingLink(
  venueId: string,
  tableNumber?: string | null,
  bookingDate?: string | null,
): Promise<{ bookingId: string | null; bookingDate: string | null }> {
  const normalizedTable = tableNumber?.trim() || null;
  if (!normalizedTable) return { bookingId: null, bookingDate: bookingDate ?? null };
  const dateValue = bookingDate ?? new Date().toISOString().slice(0, 10);

  const pool = getPool();
  const result = await pool.query(
    `SELECT id, booking_date::text AS booking_date
     FROM table_bookings
     WHERE venue_id = $1
       AND table_number = $2
       AND booking_date = $3::date
       AND status <> 'cancelled'
       AND status <> 'no-show'
     ORDER BY start_time ASC, created_at ASC
     LIMIT 1`,
    [venueId, normalizedTable, dateValue],
  );
  if (result.rows.length === 0) return { bookingId: null, bookingDate: dateValue };
  return {
    bookingId: result.rows[0].id,
    bookingDate: result.rows[0].booking_date,
  };
}

async function deductInventory(
  venueId: string,
  ticketItems: Array<{ menu_item_id: string | null; qty: number }>,
): Promise<{ deductions: Array<{ menuItemId: string; inventoryItemId: string; ingredientName: string; quantity: number }>; warnings: string[] }> {
  const pool = getPool();
  const itemsWithMenuId = ticketItems.filter((i) => i.menu_item_id);
  const deductions: Array<{ menuItemId: string; inventoryItemId: string; ingredientName: string; quantity: number }> = [];
  const warnings: string[] = [];
  if (itemsWithMenuId.length === 0) return { deductions, warnings };

  for (const item of itemsWithMenuId) {
    const menuItemId = item.menu_item_id as string;
    // Look up product_ingredients mapping: which inventory items are consumed.
    // product_ingredients.product_id → menu_items.id
    // product_ingredients.inventory_item_id → inventory_items.id (set by migration 0009)
    // Falls back to name-based matching if inventory_item_id is null.
    const ingredientsResult = await pool.query(
      `SELECT
         pi.inventory_item_id,
         pi.name,
         pi.unit                                                          AS recipe_unit,
         COALESCE(pi.quantity_per_unit, pi.quantity, 1)::numeric         AS qty_per_unit,
         ii.unit                                                          AS inventory_unit
       FROM product_ingredients pi
       LEFT JOIN inventory_items ii
         ON ii.id = pi.inventory_item_id AND ii.venue_id = $2
       WHERE pi.product_id = $1
         AND (pi.venue_id = $2 OR pi.venue_id IS NULL)`,
      [menuItemId, venueId],
    );
    if (ingredientsResult.rows.length === 0) {
      warnings.push(`No ingredient recipe for menu item ${menuItemId}`);
      continue;
    }

    for (const ingredient of ingredientsResult.rows) {
      let inventoryItemId: string | null = ingredient.inventory_item_id ?? null;
      let inventoryUnit: string = (ingredient.inventory_unit as string | null)?.trim() ?? '';

      // Fallback: resolve ingredient by name in venue inventory
      if (!inventoryItemId && ingredient.name) {
        const nameMatch = await pool.query(
          `SELECT id, unit FROM inventory_items
           WHERE venue_id = $1 AND lower(name) = lower($2)
           ORDER BY updated_at DESC LIMIT 1`,
          [venueId, ingredient.name],
        );
        inventoryItemId = nameMatch.rows[0]?.id ?? null;
        inventoryUnit   = (nameMatch.rows[0]?.unit as string | undefined)?.trim() ?? '';
      }
      if (!inventoryItemId) {
        warnings.push(`Unmapped ingredient "${ingredient.name}" for menu item ${menuItemId}`);
        continue;
      }

      const recipeQtyPerUnit = parseFloat(ingredient.qty_per_unit) * item.qty;
      if (!Number.isFinite(recipeQtyPerUnit) || recipeQtyPerUnit <= 0) {
        warnings.push(`Invalid deduction qty for "${ingredient.name}"`);
        continue;
      }

      // Convert recipe quantity (e.g. 100 g) → inventory unit (e.g. kg) before deducting
      const recipeUnit = (ingredient.recipe_unit as string | null)?.trim() ?? '';
      const deductInInvUnits = convertToInventoryUnit(recipeQtyPerUnit, recipeUnit, inventoryUnit);

      // Deduct from on_hand (the actual stock column in inventory_items)
      await pool.query(
        `UPDATE inventory_items
         SET on_hand = GREATEST(on_hand - $1, 0),
             status = CASE
               WHEN GREATEST(on_hand - $1, 0) = 0 THEN 'low'
               WHEN par_level > 0 AND (GREATEST(on_hand - $1, 0)::numeric / par_level) < 0.8 THEN 'low'
               WHEN par_level > 0 AND (GREATEST(on_hand - $1, 0)::numeric / par_level) > 1.2 THEN 'high'
               ELSE 'ok'
             END,
             updated_at = NOW()
         WHERE id = $2 AND venue_id = $3`,
        [deductInInvUnits, inventoryItemId, venueId],
      );
      deductions.push({ menuItemId, inventoryItemId, ingredientName: ingredient.name, quantity: deductInInvUnits });
    }
  }

  // Emit inventory update so all connected clients see the change
  try {
    getIo().to(`venue:${venueId}`).emit('inventory:updated', { venueId, reason: 'pos_sale', deductions });
  } catch { /* non-fatal */ }

  return { deductions, warnings };
}

/** Same ingredient resolution as deductInventory; sums Math.ceil(qty_per_unit × line qty) per inventory row. */
type TicketLineForInventory = { menu_item_id: string | null; qty: number };

async function validateTicketLinesAgainstInventory(
  venueId: string,
  lines: TicketLineForInventory[],
): Promise<
  | { ok: true }
  | {
      ok: false;
      shortfalls: Array<{
        inventoryItemId: string;
        ingredientName: string;
        need: number;
        available: number;
        recipeUnit: string | null;
        stockUnit: string | null;
      }>;
    }
> {
  const pool = getPool();
  // Accumulate raw recipe-unit quantities per inventory item (convert to inv units at comparison time)
  const needByInv = new Map<string, { name: string; needRaw: number; recipeUnit: string }>();

  for (const line of lines) {
    if (!line.menu_item_id) continue;

    const ingredientsResult = await pool.query(
      `SELECT
         pi.inventory_item_id,
         pi.name,
         pi.unit                                                   AS recipe_unit,
         COALESCE(pi.quantity_per_unit, pi.quantity, 1)::numeric  AS qty_per_unit,
         ii.unit                                                   AS inventory_unit
       FROM product_ingredients pi
       LEFT JOIN inventory_items ii
         ON ii.id = pi.inventory_item_id AND ii.venue_id = $2
       WHERE pi.product_id = $1
         AND (pi.venue_id = $2 OR pi.venue_id IS NULL)`,
      [line.menu_item_id, venueId],
    );

    for (const ingredient of ingredientsResult.rows) {
      let inventoryItemId: string | null = ingredient.inventory_item_id ?? null;
      let inventoryUnit: string = (ingredient.inventory_unit as string | null)?.trim() ?? '';

      if (!inventoryItemId && ingredient.name) {
        const nameMatch = await pool.query(
          `SELECT id, unit FROM inventory_items
           WHERE venue_id = $1 AND lower(name) = lower($2)
           ORDER BY updated_at DESC LIMIT 1`,
          [venueId, ingredient.name],
        );
        inventoryItemId = nameMatch.rows[0]?.id ?? null;
        inventoryUnit   = (nameMatch.rows[0]?.unit as string | undefined)?.trim() ?? '';
      }
      if (!inventoryItemId) continue;

      const recipeQty = parseFloat(ingredient.qty_per_unit) * line.qty;
      if (!Number.isFinite(recipeQty) || recipeQty <= 0) continue;

      const recipeUnit = String(ingredient.recipe_unit ?? '').trim();

      // Convert recipe quantity to inventory units right here so needByInv stores inventory-unit values
      const needInInvUnits = convertToInventoryUnit(recipeQty, recipeUnit, inventoryUnit);

      const prev = needByInv.get(inventoryItemId);
      needByInv.set(inventoryItemId, {
        name: (ingredient.name as string) || prev?.name || 'Ingredient',
        needRaw: (prev?.needRaw ?? 0) + needInInvUnits,
        recipeUnit: prev?.recipeUnit || recipeUnit,
      });
    }
  }

  if (needByInv.size === 0) return { ok: true };

  const ids = [...needByInv.keys()];
  const stockResult = await pool.query(
    `SELECT id, name, on_hand, unit FROM inventory_items WHERE venue_id = $1 AND id = ANY($2::uuid[])`,
    [venueId, ids],
  );

  const shortfalls: Array<{
    inventoryItemId: string;
    ingredientName: string;
    need: number;
    available: number;
    recipeUnit: string | null;
    stockUnit: string | null;
  }> = [];

  const onHandById = new Map(
    stockResult.rows.map((r: { id: string; name: string; on_hand: unknown; unit: string }) => [
      r.id,
      { name: r.name, onHand: Number(r.on_hand), unit: r.unit },
    ]),
  );

  for (const id of ids) {
    const entry = needByInv.get(id)!;
    const needInInvUnits = entry.needRaw; // already converted above
    const row = onHandById.get(id);
    const available = row ? row.onHand : 0;
    const stockUnit = row?.unit?.trim() || null;
    if (needInInvUnits > available) {
      shortfalls.push({
        inventoryItemId: id,
        ingredientName: row?.name ?? entry.name,
        need: Math.round(needInInvUnits * 1000) / 1000, // round to 3dp for display
        available,
        recipeUnit: stockUnit, // show in inventory unit for clarity
        stockUnit,
      });
    }
  }

  if (shortfalls.length === 0) return { ok: true };
  return { ok: false, shortfalls };
}

function inventoryShortfallMessage(
  shortfalls: Array<{
    ingredientName: string;
    need: number;
    available: number;
    recipeUnit?: string | null;
    stockUnit?: string | null;
  }>,
): string {
  const parts = shortfalls.map((s) => {
    const unit = s.stockUnit ? ` ${s.stockUnit}` : '';
    return `${s.ingredientName}: need ${s.need}${unit}, only ${s.available}${unit} in stock`;
  });
  return `Insufficient stock — ${parts.join('; ')}.`;
}

function emitTicketUpdate(venueId: string, action: string, ticketId: string): void {
  try {
    getIo().to(`venue:${venueId}`).emit('pos:tickets_updated', { venueId, action, ticketId });
  } catch {
    // Ignore websocket emission failures.
  }
}

function emitPaymentUpdate(venueId: string, action: string, ticketId: string, paymentId?: string): void {
  try {
    getIo().to(`venue:${venueId}`).emit('pos:payments_updated', { venueId, action, ticketId, paymentId });
  } catch {
    // Ignore websocket emission failures.
  }
}

function emitInventoryUpdate(venueId: string, reason: string, ticketId?: string): void {
  try {
    getIo().to(`venue:${venueId}`).emit('inventory:updated', { venueId, reason, ticketId });
  } catch {
    // Ignore websocket emission failures.
  }
}

// ─── POS Config ──────────────────────────────────────────────────────────────

// GET /api/venues/:id/pos/config
router.get('/pos/config', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;

    let result = await pool.query('SELECT * FROM pos_config WHERE venue_id = $1', [venueId]);

    if (result.rows.length === 0) {
      // Create default config
      result = await pool.query(
        `INSERT INTO pos_config (id, venue_id, default_tax_rate, service_charge_rate, service_charge_enabled,
         auto_close_on_full_payment, require_clock_in, receipt_header, receipt_footer, currency, ticket_prefix, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 20, 0, false, true, false, NULL, NULL, 'GBP', 'TK', NOW(), NOW())
         RETURNING *`,
        [venueId],
      );
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Get config error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch POS config' });
  }
});

// PATCH /api/venues/:id/pos/config
router.patch('/pos/config', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = configUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;

    // Ensure config exists
    const existing = await pool.query('SELECT id FROM pos_config WHERE venue_id = $1', [venueId]);
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO pos_config (id, venue_id, default_tax_rate, service_charge_rate, service_charge_enabled,
         auto_close_on_full_payment, require_clock_in, currency, ticket_prefix, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 20, 0, false, true, false, 'GBP', 'TK', NOW(), NOW())`,
        [venueId],
      );
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      defaultTaxRate: 'default_tax_rate',
      serviceChargeRate: 'service_charge_rate',
      serviceChargeEnabled: 'service_charge_enabled',
      autoCloseOnFullPayment: 'auto_close_on_full_payment',
      requireClockIn: 'require_clock_in',
      receiptHeader: 'receipt_header',
      receiptFooter: 'receipt_footer',
      currency: 'currency',
      ticketPrefix: 'ticket_prefix',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      const val = (parsed.data as Record<string, unknown>)[jsKey];
      if (val !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    values.push(venueId);
    const result = await pool.query(
      `UPDATE pos_config SET ${setClauses.join(', ')} WHERE venue_id = $${paramIndex} RETURNING *`,
      values,
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Update config error:', err);
    res.status(500).json({ success: false, error: 'Failed to update POS config' });
  }
});

// ─── Sessions (Shifts) ──────────────────────────────────────────────────────

// POST /api/venues/:id/pos/sessions/open
router.post('/pos/sessions/open', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = openSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;

    // Validate no open session exists
    const openCheck = await pool.query(
      `SELECT id FROM pos_sessions WHERE venue_id = $1 AND status = 'open'`,
      [venueId],
    );
    if (openCheck.rows.length > 0) {
      res.status(409).json({ success: false, error: 'An open session already exists. Close it before opening a new one.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO pos_sessions (id, venue_id, opened_by, staff_name, opening_float_pence, status, notes, opened_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'open', $5, NOW(), NOW(), NOW())
       RETURNING *`,
      [venueId, req.userId, parsed.data.staffName, parsed.data.openingFloat, parsed.data.notes ?? null],
    );

    await logAudit(venueId, req.userId!, 'session_opened', 'session', result.rows[0].id, {
      staffName: parsed.data.staffName,
      openingFloat: parsed.data.openingFloat,
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Open session error:', err);
    res.status(500).json({ success: false, error: 'Failed to open session' });
  }
});

// POST /api/venues/:id/pos/sessions/close
router.post('/pos/sessions/close', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = closeSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;

    const sessionResult = await pool.query(
      `SELECT * FROM pos_sessions WHERE venue_id = $1 AND status = 'open'`,
      [venueId],
    );
    if (sessionResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'No open session found' });
      return;
    }
    const session = sessionResult.rows[0];

    // Check for open tickets
    const openTickets = await pool.query(
      `SELECT COUNT(*)::int AS count FROM pos_tickets WHERE session_id = $1 AND status IN ('open', 'parked')`,
      [session.id],
    );
    if (openTickets.rows[0].count > 0) {
      res.status(409).json({
        success: false,
        error: `Cannot close session: ${openTickets.rows[0].count} ticket(s) still open or parked`,
      });
      return;
    }

    // Calculate totals from tickets in this session
    const totalsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS ticket_count,
         COALESCE(SUM(total_pence), 0)::int AS total_revenue_pence,
         COALESCE(SUM(tax_pence), 0)::int AS total_tax_pence,
         COALESCE(SUM(service_charge_pence), 0)::int AS total_service_charge_pence,
         COALESCE(SUM(discount_pence), 0)::int AS total_discount_pence
       FROM pos_tickets
       WHERE session_id = $1 AND status = 'closed'`,
      [session.id],
    );
    const totals = totalsResult.rows[0];

    // Calculate payment breakdown by method
    const paymentBreakdown = await pool.query(
      `SELECT method, SUM(amount_pence)::int AS total, SUM(tip_pence)::int AS tips, COUNT(*)::int AS count
       FROM pos_payments p
       JOIN pos_tickets t ON t.id = p.ticket_id
       WHERE t.session_id = $1 AND p.status = 'completed'
       GROUP BY method`,
      [session.id],
    );

    const result = await pool.query(
      `UPDATE pos_sessions
       SET status = 'closed', closed_at = NOW(), closed_by = $2,
           ticket_count = $3, total_revenue_pence = $4, total_tax_pence = $5,
           total_service_charge_pence = $6, total_discount_pence = $7,
           closing_notes = $8, counted_cash_pence = $9, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        session.id, req.userId, totals.ticket_count, totals.total_revenue_pence,
        totals.total_tax_pence, totals.total_service_charge_pence, totals.total_discount_pence,
        parsed.data.closingNotes ?? null, parsed.data.countedCashPence ?? null,
      ],
    );

    await logAudit(venueId, req.userId!, 'session_closed', 'session', session.id, {
      ticketCount: totals.ticket_count,
      totalRevenue: totals.total_revenue_pence,
      paymentBreakdown: paymentBreakdown.rows,
    });

    res.json({ success: true, data: { ...result.rows[0], paymentBreakdown: paymentBreakdown.rows } });
  } catch (err) {
    console.error('[POS] Close session error:', err);
    res.status(500).json({ success: false, error: 'Failed to close session' });
  }
});

// GET /api/venues/:id/pos/sessions/current
router.get('/pos/sessions/current', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;

    const result = await pool.query(
      `SELECT * FROM pos_sessions WHERE venue_id = $1 AND status = 'open' LIMIT 1`,
      [venueId],
    );

    if (result.rows.length === 0) {
      res.json({ success: true, data: null });
      return;
    }

    // Attach running totals
    const totals = await pool.query(
      `SELECT
         COUNT(*)::int AS ticket_count,
         COALESCE(SUM(total_pence), 0)::int AS running_total_pence
       FROM pos_tickets
       WHERE session_id = $1 AND status IN ('open', 'parked', 'closed')`,
      [result.rows[0].id],
    );

    res.json({ success: true, data: { ...result.rows[0], ...totals.rows[0] } });
  } catch (err) {
    console.error('[POS] Get current session error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch current session' });
  }
});

// GET /api/venues/:id/pos/sessions
router.get('/pos/sessions', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM pos_sessions WHERE venue_id = $1',
      [venueId],
    );
    const total = countResult.rows[0].total;

    const result = await pool.query(
      `SELECT * FROM pos_sessions WHERE venue_id = $1 ORDER BY opened_at DESC LIMIT $2 OFFSET $3`,
      [venueId, limit, offset],
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[POS] List sessions error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
});

// GET /api/venues/:id/pos/sessions/:sessionId
router.get('/pos/sessions/:sessionId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const { sessionId } = req.params;

    const result = await pool.query(
      'SELECT * FROM pos_sessions WHERE id = $1 AND venue_id = $2',
      [sessionId, venueId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    // Summary data
    const ticketsResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_pence), 0)::int AS total
       FROM pos_tickets WHERE session_id = $1 GROUP BY status`,
      [sessionId],
    );

    const paymentBreakdown = await pool.query(
      `SELECT method, SUM(amount_pence)::int AS total, SUM(tip_pence)::int AS tips, COUNT(*)::int AS count
       FROM pos_payments p
       JOIN pos_tickets t ON t.id = p.ticket_id
       WHERE t.session_id = $1 AND p.status = 'completed'
       GROUP BY method`,
      [sessionId],
    );

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        ticketSummary: ticketsResult.rows,
        paymentBreakdown: paymentBreakdown.rows,
      },
    });
  } catch (err) {
    console.error('[POS] Get session detail error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch session detail' });
  }
});

// ─── Tickets ─────────────────────────────────────────────────────────────────

// POST /api/venues/:id/pos/tickets
router.post('/pos/tickets', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;

    // Must have an open session
    const sessionResult = await pool.query(
      `SELECT id FROM pos_sessions WHERE venue_id = $1 AND status = 'open'`,
      [venueId],
    );
    if (sessionResult.rows.length === 0) {
      res.status(409).json({ success: false, error: 'No open session. Open a shift before creating tickets.' });
      return;
    }
    const sessionId = sessionResult.rows[0].id;

    // Auto-number: get the ticket prefix from config and the next number
    const configResult = await pool.query(
      `SELECT ticket_prefix FROM pos_config WHERE venue_id = $1`,
      [venueId],
    );
    const prefix = configResult.rows[0]?.ticket_prefix ?? 'TK';

    const seqResult = await pool.query(
      `SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next_num
       FROM pos_tickets WHERE venue_id = $1 AND session_id = $2`,
      [venueId, sessionId],
    );
    const ticketNumber = seqResult.rows[0].next_num;
    const ticketRef = `${prefix}-${String(ticketNumber).padStart(4, '0')}`;

    const bookingLink = await resolveBookingLink(venueId, parsed.data.tableNumber, parsed.data.bookingDate);
    const result = await pool.query(
      `INSERT INTO pos_tickets (
         id, venue_id, session_id, ticket_number, ticket_ref, ticket_type,
         table_number, booking_date, booking_id, customer_name, covers, notes, status,
         subtotal_pence, tax_pence, service_charge_pence, discount_pence, total_pence,
         discount_type, discount_value, created_by, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11, 'open',
         0, 0, 0, 0, 0,
         NULL, 0, $12, NOW(), NOW()
       ) RETURNING *`,
      [
        venueId, sessionId, ticketNumber, ticketRef, parsed.data.ticketType,
        parsed.data.tableNumber ?? null, bookingLink.bookingDate, bookingLink.bookingId,
        parsed.data.customerName ?? null, parsed.data.covers, parsed.data.notes ?? null, req.userId,
      ],
    );

    await logAudit(venueId, req.userId!, 'ticket_created', 'ticket', result.rows[0].id, {
      ticketRef, ticketType: parsed.data.ticketType,
    });
    emitTicketUpdate(venueId, 'created', result.rows[0].id);

    // ── Cross-system sync: booking → "seated" ──────────────────────────────
    if (bookingLink.bookingId) {
      try {
        await pool.query(
          `UPDATE table_bookings SET status = 'seated', updated_at = NOW()
           WHERE id = $1 AND venue_id = $2 AND status IN ('confirmed', 'pending')`,
          [bookingLink.bookingId, venueId],
        );
        getIo().to(`venue:${venueId}`).emit('bookings:updated', {
          venueId, action: 'seated_from_pos', bookingId: bookingLink.bookingId,
        });
      } catch { /* non-fatal */ }
    }

    // ── Auto-status: RESERVED → OCCUPIED when first POS order opens ──────
    if (parsed.data.tableNumber) {
      try {
        const autoResult = await pool.query(
          `UPDATE venue_tables
           SET status = 'occupied', cleaning_started_at = NULL, updated_at = NOW()
           WHERE venue_id = $1 AND number = $2
             AND status IN ('reserved', 'available')
             AND (auto_status = true OR status = 'reserved')
           RETURNING id`,
          [venueId, parsed.data.tableNumber],
        );
        if (autoResult.rows.length > 0) {
          try {
            getIo().to(`venue:${venueId}`).emit('bookings:updated', {
              venueId,
              action: 'table_status_changed',
              tableId: autoResult.rows[0].id,
              newStatus: 'occupied',
              triggeredBy: 'auto',
              timestamp: new Date().toISOString(),
            });
          } catch { /* non-fatal */ }
        }
      } catch { /* non-fatal */ }
    }

    // ── Cross-system sync: mirror ticket as order ───────────────────────────
    try {
      const [orderRow] = (await pool.query(
        `INSERT INTO orders (id, venue_id, table_number, customer_name, covers, status, total_pence, notes, source, pos_ticket_id, ordered_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'new', 0, $5, 'pos', $6, NOW(), NOW(), NOW())
         RETURNING id`,
        [venueId, parsed.data.tableNumber ?? null, parsed.data.customerName ?? null, parsed.data.covers, parsed.data.notes ?? null, result.rows[0].id],
      )).rows;
      // Store order_id directly on the ticket via mirror_order_id column
      await pool.query(
        `UPDATE pos_tickets SET mirror_order_id = $2, updated_at = NOW() WHERE id = $1`,
        [result.rows[0].id, orderRow.id],
      );
      getIo().to(`venue:${venueId}`).emit('orders:updated', { venueId, action: 'created_from_pos', orderId: orderRow.id });
    } catch { /* non-fatal — order mirror is supplementary */ }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Create ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to create ticket' });
  }
});

// GET /api/venues/:id/pos/tickets
router.get('/pos/tickets', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['venue_id = $1'];
    const values: unknown[] = [venueId];
    let paramIndex = 2;

    if (req.query.status && typeof req.query.status === 'string') {
      const validStatuses = ['open', 'parked', 'closed', 'voided'];
      if (validStatuses.includes(req.query.status)) {
        conditions.push(`status = $${paramIndex}`);
        values.push(req.query.status);
        paramIndex++;
      }
    }

    if (req.query.sessionId && typeof req.query.sessionId === 'string') {
      conditions.push(`session_id = $${paramIndex}`);
      values.push(req.query.sessionId);
      paramIndex++;
    }

    if (req.query.date && typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      conditions.push(`created_at >= $${paramIndex} AND created_at < $${paramIndex + 1}`);
      values.push(`${req.query.date}T00:00:00.000Z`, `${req.query.date}T23:59:59.999Z`);
      paramIndex += 2;
    }

    const where = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM pos_tickets WHERE ${where}`,
      values,
    );
    const total = countResult.rows[0].total;

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM pos_tickets WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values,
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[POS] List tickets error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
});

// GET /api/venues/:id/pos/tickets/active
router.get('/pos/tickets/active', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;

    const ticketsResult = await pool.query(
      `SELECT * FROM pos_tickets WHERE venue_id = $1 AND status IN ('open', 'parked') ORDER BY created_at ASC`,
      [venueId],
    );

    if (ticketsResult.rows.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const ticketIds = ticketsResult.rows.map((t: { id: string }) => t.id);
    const itemsResult = await pool.query(
      `SELECT * FROM pos_ticket_items WHERE ticket_id = ANY($1) AND voided = false ORDER BY created_at ASC`,
      [ticketIds],
    );

    const itemsByTicket = new Map<string, typeof itemsResult.rows>();
    for (const item of itemsResult.rows) {
      const arr = itemsByTicket.get(item.ticket_id) ?? [];
      arr.push(item);
      itemsByTicket.set(item.ticket_id, arr);
    }

    const data = ticketsResult.rows.map((t: { id: string }) => ({
      ...t,
      items: itemsByTicket.get(t.id) ?? [],
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[POS] Get active tickets error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch active tickets' });
  }
});

// GET /api/venues/:id/pos/tickets/:ticketId
router.get('/pos/tickets/:ticketId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    const ticketResult = await pool.query(
      'SELECT * FROM pos_tickets WHERE id = $1 AND venue_id = $2',
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const [itemsResult, paymentsResult] = await Promise.all([
      pool.query(
        'SELECT * FROM pos_ticket_items WHERE ticket_id = $1 ORDER BY created_at ASC',
        [ticketId],
      ),
      pool.query(
        'SELECT * FROM pos_payments WHERE ticket_id = $1 ORDER BY created_at ASC',
        [ticketId],
      ),
    ]);

    res.json({
      success: true,
      data: {
        ...ticketResult.rows[0],
        items: itemsResult.rows,
        payments: paymentsResult.rows,
      },
    });
  } catch (err) {
    console.error('[POS] Get ticket detail error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
  }
});

// PATCH /api/venues/:id/pos/tickets/:ticketId
router.patch('/pos/tickets/:ticketId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    // Verify ticket exists and is editable
    const existing = await pool.query(
      `SELECT id, status FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (existing.rows[0].status === 'voided') {
      res.status(409).json({ success: false, error: 'Cannot update a voided ticket' });
      return;
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      tableNumber: 'table_number',
      bookingDate: 'booking_date',
      customerName: 'customer_name',
      covers: 'covers',
      notes: 'notes',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      const val = (parsed.data as Record<string, unknown>)[jsKey];
      if (val !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    const parsedPayload = parsed.data as Record<string, unknown>;
    const shouldRelink = parsedPayload.tableNumber !== undefined || parsedPayload.bookingDate !== undefined;
    if (shouldRelink) {
      const current = await pool.query(
        `SELECT table_number, booking_date::text AS booking_date FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
        [ticketId, venueId],
      );
      const tableNumber = (parsedPayload.tableNumber as string | null | undefined) ?? current.rows[0]?.table_number ?? null;
      const bookingDate = (parsedPayload.bookingDate as string | null | undefined) ?? current.rows[0]?.booking_date ?? null;
      const bookingLink = await resolveBookingLink(venueId, tableNumber, bookingDate);
      setClauses.push(`booking_id = $${paramIndex}`);
      values.push(bookingLink.bookingId);
      paramIndex++;
    }

    values.push(ticketId, venueId);
    const result = await pool.query(
      `UPDATE pos_tickets SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND venue_id = $${paramIndex + 1} RETURNING *`,
      values,
    );

    emitTicketUpdate(venueId, 'updated', ticketId);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Update ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to update ticket' });
  }
});

// POST /api/venues/:id/pos/tickets/:ticketId/park
router.post('/pos/tickets/:ticketId/park', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    const existing = await pool.query(
      `SELECT id, status FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (existing.rows[0].status !== 'open') {
      res.status(409).json({ success: false, error: 'Only open tickets can be parked' });
      return;
    }

    const result = await pool.query(
      `UPDATE pos_tickets SET status = 'parked', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [ticketId],
    );

    await logAudit(venueId, req.userId!, 'ticket_parked', 'ticket', ticketId, {});
    emitTicketUpdate(venueId, 'parked', ticketId);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Park ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to park ticket' });
  }
});

// POST /api/venues/:id/pos/tickets/:ticketId/reopen
router.post('/pos/tickets/:ticketId/reopen', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    const existing = await pool.query(
      `SELECT id, status FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (!['parked', 'closed'].includes(existing.rows[0].status)) {
      res.status(409).json({ success: false, error: 'Only parked or closed tickets can be reopened' });
      return;
    }

    const result = await pool.query(
      `UPDATE pos_tickets SET status = 'open', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [ticketId],
    );

    await logAudit(venueId, req.userId!, 'ticket_reopened', 'ticket', ticketId, {
      previousStatus: existing.rows[0].status,
    });
    emitTicketUpdate(venueId, 'reopened', ticketId);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Reopen ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to reopen ticket' });
  }
});

// DELETE /api/venues/:id/pos/tickets/:ticketId (void)
router.delete('/pos/tickets/:ticketId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = voidTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    const existing = await pool.query(
      `SELECT id, status, ticket_ref, total_pence FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (existing.rows[0].status === 'voided') {
      res.status(409).json({ success: false, error: 'Ticket is already voided' });
      return;
    }

    // Check for completed payments - cannot void ticket with completed payments
    const paymentsCheck = await pool.query(
      `SELECT COUNT(*)::int AS count FROM pos_payments WHERE ticket_id = $1 AND status = 'completed'`,
      [ticketId],
    );
    if (paymentsCheck.rows[0].count > 0) {
      res.status(409).json({ success: false, error: 'Cannot void a ticket with completed payments. Refund payments first.' });
      return;
    }

    const result = await pool.query(
      `UPDATE pos_tickets SET status = 'voided', void_reason = $2, voided_by = $3, voided_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [ticketId, parsed.data.reason, req.userId],
    );

    await logAudit(venueId, req.userId!, 'ticket_voided', 'ticket', ticketId, {
      reason: parsed.data.reason,
      ticketRef: existing.rows[0].ticket_ref,
      totalPence: existing.rows[0].total_pence,
    });
    emitTicketUpdate(venueId, 'voided', ticketId);

    // ── Cross-system void cascade ──────────────────────────────────────────
    // 1. Cancel linked booking (revert to confirmed)
    try {
      await pool.query(
        `UPDATE table_bookings SET status = 'confirmed', updated_at = NOW()
         WHERE id = (SELECT booking_id FROM pos_tickets WHERE id = $1)
           AND venue_id = $2 AND status IN ('seated')`,
        [ticketId, venueId],
      );
      getIo().to(`venue:${venueId}`).emit('bookings:updated', { venueId, action: 'reverted_from_pos_void' });
    } catch { /* non-fatal */ }

    // 2. Cancel mirror order
    try {
      await pool.query(
        `UPDATE orders SET status = 'cancelled', updated_at = NOW()
         WHERE id = (SELECT mirror_order_id FROM pos_tickets WHERE id = $1)
           AND venue_id = $2 AND status NOT IN ('cancelled')`,
        [ticketId, venueId],
      );
      getIo().to(`venue:${venueId}`).emit('orders:updated', { venueId, action: 'cancelled_from_pos_void' });
    } catch { /* non-fatal */ }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POS] Void ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to void ticket' });
  }
});

// ─── Ticket Items ────────────────────────────────────────────────────────────

// POST /api/venues/:id/pos/tickets/:ticketId/items
router.post('/pos/tickets/:ticketId/items', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    // Verify ticket is editable
    const ticketResult = await pool.query(
      `SELECT id, status FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (!['open', 'parked'].includes(ticketResult.rows[0].status)) {
      res.status(409).json({ success: false, error: 'Can only add items to open or parked tickets' });
      return;
    }

    const currentItems = await pool.query(
      `SELECT menu_item_id, qty FROM pos_ticket_items WHERE ticket_id = $1 AND voided = false`,
      [ticketId],
    );
    const proposedLines: TicketLineForInventory[] = [
      ...currentItems.rows.map((r: { menu_item_id: string | null; qty: number }) => ({
        menu_item_id: r.menu_item_id,
        qty: r.qty,
      })),
      ...parsed.data.items.map((i) => ({
        menu_item_id: i.menuItemId ?? null,
        qty: i.qty,
      })),
    ];
    const invCheck = await validateTicketLinesAgainstInventory(venueId, proposedLines);
    if (!invCheck.ok) {
      res.status(409).json({
        success: false,
        error: inventoryShortfallMessage(invCheck.shortfalls),
        data: { shortfalls: invCheck.shortfalls },
      });
      return;
    }

    // Insert items
    const insertedItems = [];
    for (const item of parsed.data.items) {
      const modifierPence = item.modifierPence ?? 0;
      const lineTotalPence = (item.unitPricePence + modifierPence) * item.qty;
      const result = await pool.query(
        `INSERT INTO pos_ticket_items (
           id, ticket_id, menu_item_id, name, qty, unit_price_pence, modifier_pence,
           line_total_pence, notes, voided, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, false, NOW(), NOW()
         ) RETURNING *`,
        [ticketId, item.menuItemId ?? null, item.name, item.qty, item.unitPricePence, modifierPence, lineTotalPence, item.notes ?? null],
      );
      insertedItems.push(result.rows[0]);
    }

    // Recalculate totals
    const totals = await recalcTicketTotals(ticketId);

    emitTicketUpdate(venueId, 'items_added', ticketId);

    // ── Sync items + total to mirror order ─────────────────────────────────
    try {
      const mirrorResult = await pool.query(
        `SELECT mirror_order_id FROM pos_tickets WHERE id = $1 AND mirror_order_id IS NOT NULL`,
        [ticketId],
      );
      if (mirrorResult.rows.length > 0) {
        const mirrorOrderId = mirrorResult.rows[0].mirror_order_id;
        for (const item of parsed.data.items) {
          await pool.query(
            `INSERT INTO order_items (id, order_id, name, qty, unit_price_pence, line_total_pence, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())`,
            [mirrorOrderId, item.name, item.qty, item.unitPricePence, item.qty * item.unitPricePence],
          );
        }
        await pool.query(
          `UPDATE orders SET total_pence = $2, status = 'preparing', updated_at = NOW() WHERE id = $1`,
          [mirrorOrderId, totals.totalPence],
        );
        getIo().to(`venue:${venueId}`).emit('orders:updated', { venueId, action: 'items_synced_from_pos', orderId: mirrorOrderId });
      }
    } catch { /* non-fatal */ }

    res.status(201).json({ success: true, data: { items: insertedItems, totals } });
  } catch (err) {
    console.error('[POS] Add items error:', err);
    res.status(500).json({ success: false, error: 'Failed to add items' });
  }
});

// PATCH /api/venues/:id/pos/tickets/:ticketId/items/:itemId
router.patch('/pos/tickets/:ticketId/items/:itemId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId, itemId } = req.params;

    // Verify ticket ownership and editability
    const ticketResult = await pool.query(
      `SELECT id, status FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (!['open', 'parked'].includes(ticketResult.rows[0].status)) {
      res.status(409).json({ success: false, error: 'Can only update items on open or parked tickets' });
      return;
    }

    // Verify item exists on this ticket
    const itemResult = await pool.query(
      `SELECT * FROM pos_ticket_items WHERE id = $1 AND ticket_id = $2 AND voided = false`,
      [itemId, ticketId],
    );
    if (itemResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Item not found or already voided' });
      return;
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;
    const existingItem = itemResult.rows[0];

    if (parsed.data.qty !== undefined) {
      const allItems = await pool.query(
        `SELECT id, menu_item_id, qty FROM pos_ticket_items WHERE ticket_id = $1 AND voided = false`,
        [ticketId],
      );
      const proposedLines: TicketLineForInventory[] = allItems.rows.map(
        (r: { id: string; menu_item_id: string | null; qty: number }) =>
          r.id === itemId
            ? { menu_item_id: r.menu_item_id, qty: parsed.data.qty! }
            : { menu_item_id: r.menu_item_id, qty: r.qty },
      );
      const invCheck = await validateTicketLinesAgainstInventory(venueId, proposedLines);
      if (!invCheck.ok) {
        res.status(409).json({
          success: false,
          error: inventoryShortfallMessage(invCheck.shortfalls),
          data: { shortfalls: invCheck.shortfalls },
        });
        return;
      }
    }

    if (parsed.data.qty !== undefined) {
      setClauses.push(`qty = $${paramIndex}`);
      values.push(parsed.data.qty);
      paramIndex++;
      const lineTotalPence = (existingItem.unit_price_pence + (existingItem.modifier_pence || 0)) * parsed.data.qty;
      setClauses.push(`line_total_pence = $${paramIndex}`);
      values.push(lineTotalPence);
      paramIndex++;
    }

    if (parsed.data.notes !== undefined) {
      setClauses.push(`notes = $${paramIndex}`);
      values.push(parsed.data.notes);
      paramIndex++;
    }

    values.push(itemId, ticketId);
    const result = await pool.query(
      `UPDATE pos_ticket_items SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND ticket_id = $${paramIndex + 1} RETURNING *`,
      values,
    );

    // Recalculate totals
    const totals = await recalcTicketTotals(ticketId);

    emitTicketUpdate(venueId, 'item_updated', ticketId);

    res.json({ success: true, data: { item: result.rows[0], totals } });
  } catch (err) {
    console.error('[POS] Update item error:', err);
    res.status(500).json({ success: false, error: 'Failed to update item' });
  }
});

// DELETE /api/venues/:id/pos/tickets/:ticketId/items/:itemId (void item)
router.delete('/pos/tickets/:ticketId/items/:itemId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId, itemId } = req.params;

    // Verify ticket ownership and editability
    const ticketResult = await pool.query(
      `SELECT id, status FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (!['open', 'parked'].includes(ticketResult.rows[0].status)) {
      res.status(409).json({ success: false, error: 'Can only void items on open or parked tickets' });
      return;
    }

    const itemResult = await pool.query(
      `SELECT * FROM pos_ticket_items WHERE id = $1 AND ticket_id = $2`,
      [itemId, ticketId],
    );
    if (itemResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }
    if (itemResult.rows[0].voided) {
      res.status(409).json({ success: false, error: 'Item is already voided' });
      return;
    }

    // Void the item (soft delete)
    const result = await pool.query(
      `UPDATE pos_ticket_items SET voided = true, voided_at = NOW(), voided_by = $3, updated_at = NOW()
       WHERE id = $1 AND ticket_id = $2 RETURNING *`,
      [itemId, ticketId, req.userId],
    );

    // Recalculate totals
    const totals = await recalcTicketTotals(ticketId);

    await logAudit(venueId, req.userId!, 'item_voided', 'ticket_item', itemId, {
      ticketId,
      itemName: itemResult.rows[0].name,
      qty: itemResult.rows[0].qty,
      lineTotalPence: itemResult.rows[0].line_total_pence,
    });
    emitTicketUpdate(venueId, 'item_voided', ticketId);

    res.json({ success: true, data: { item: result.rows[0], totals } });
  } catch (err) {
    console.error('[POS] Void item error:', err);
    res.status(500).json({ success: false, error: 'Failed to void item' });
  }
});

// ─── Payments ────────────────────────────────────────────────────────────────

// POST /api/venues/:id/pos/tickets/:ticketId/pay
router.post('/pos/tickets/:ticketId/pay', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    // Verify ticket
    const ticketResult = await pool.query(
      `SELECT * FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    const ticket = ticketResult.rows[0];
    if (!['open', 'parked'].includes(ticket.status)) {
      res.status(409).json({ success: false, error: 'Can only pay on open or parked tickets' });
      return;
    }

    // Idempotency check
    const idempotencyCheck = await pool.query(
      `SELECT id FROM pos_payments WHERE ticket_id = $1 AND idempotency_key = $2`,
      [ticketId, parsed.data.idempotencyKey],
    );
    if (idempotencyCheck.rows.length > 0) {
      res.status(409).json({ success: false, error: 'Duplicate payment (idempotency key already used)' });
      return;
    }

    // Calculate how much has already been paid
    const paidResult = await pool.query(
      `SELECT COALESCE(SUM(amount_pence), 0)::int AS paid
       FROM pos_payments WHERE ticket_id = $1 AND status = 'completed'`,
      [ticketId],
    );
    const alreadyPaid = paidResult.rows[0].paid;
    const remaining = ticket.total_pence - alreadyPaid;

    if (remaining <= 0) {
      res.status(409).json({ success: false, error: 'Ticket is already fully paid' });
      return;
    }

    // Insert payment
    const paymentResult = await pool.query(
      `INSERT INTO pos_payments (
         id, ticket_id, venue_id, method, amount_pence, tip_pence,
         idempotency_key, reference, status, processed_by, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'completed', $8, NOW(), NOW()
       ) RETURNING *`,
      [
        ticketId, venueId, parsed.data.method, parsed.data.amountPence,
        parsed.data.tipPence, parsed.data.idempotencyKey,
        parsed.data.reference ?? null, req.userId,
      ],
    );

    const newTotalPaid = alreadyPaid + parsed.data.amountPence;
    let ticketClosed = false;

    // Check POS config for auto-close
    const configResult = await pool.query(
      `SELECT auto_close_on_full_payment FROM pos_config WHERE venue_id = $1`,
      [venueId],
    );
    const autoClose = configResult.rows[0]?.auto_close_on_full_payment !== false;

    // Deduct inventory once the ticket is fully paid (independent of auto-close setting).
    if (newTotalPaid >= ticket.total_pence) {
      const deductionClaim = await pool.query(
        `UPDATE pos_tickets
         SET status = CASE WHEN $4 THEN 'closed' ELSE status END,
             closed_at = CASE WHEN $4 THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
             inventory_deduction_ref = COALESCE(inventory_deduction_ref, $2),
             updated_at = NOW()
         WHERE id = $1
           AND venue_id = $3
           AND (inventory_deduction_ref IS NULL OR inventory_deduction_ref = $2)
         RETURNING inventory_deducted_at`,
        [ticketId, paymentResult.rows[0].id, venueId, autoClose],
      );
      ticketClosed = autoClose;

      const shouldDeductInventory = deductionClaim.rows.length > 0 && !deductionClaim.rows[0].inventory_deducted_at;
      if (shouldDeductInventory) {
        const ticketItems = await pool.query(
          `SELECT menu_item_id, qty FROM pos_ticket_items WHERE ticket_id = $1 AND voided = false`,
          [ticketId],
        );
        try {
          const inventoryResult = await deductInventory(venueId, ticketItems.rows);
          await pool.query(
            `UPDATE pos_tickets
             SET inventory_deducted_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND inventory_deduction_ref = $2 AND inventory_deducted_at IS NULL`,
            [ticketId, paymentResult.rows[0].id],
          );
          await logAudit(venueId, req.userId!, 'inventory_deducted', 'ticket', ticketId, {
            paymentId: paymentResult.rows[0].id,
            deductions: inventoryResult.deductions,
            warnings: inventoryResult.warnings,
          });
          emitInventoryUpdate(venueId, 'pos_ticket_paid', ticketId);
        } catch (invErr) {
          await pool.query(
            `UPDATE pos_tickets
             SET inventory_deduction_ref = NULL, updated_at = NOW()
             WHERE id = $1 AND inventory_deducted_at IS NULL AND inventory_deduction_ref = $2`,
            [ticketId, paymentResult.rows[0].id],
          );
          console.error('[POS] Inventory deduction error (non-fatal):', invErr);
        }
      }

      // Cross-system sync when the bill is fully paid (even if ticket stays open / no auto-close)
      try {
        await pool.query(
          `UPDATE table_bookings SET status = 'completed', updated_at = NOW()
           WHERE id = (SELECT booking_id FROM pos_tickets WHERE id = $1)
             AND venue_id = $2 AND status IN ('seated', 'confirmed', 'pending')`,
          [ticketId, venueId],
        );
        getIo().to(`venue:${venueId}`).emit('bookings:updated', { venueId, action: 'completed_from_pos' });
      } catch { /* non-fatal */ }

      try {
        const tableNumber = ticket.table_number;
        if (tableNumber) {
          const autoResult = await pool.query(
            `UPDATE venue_tables
             SET status = 'cleaning', cleaning_started_at = NOW(), updated_at = NOW()
             WHERE venue_id = $1 AND number = $2
               AND (auto_status = true OR status IN ('occupied', 'reserved'))
               AND status IN ('occupied', 'reserved')
             RETURNING id`,
            [venueId, tableNumber],
          );
          if (autoResult.rows.length > 0) {
            try {
              getIo().to(`venue:${venueId}`).emit('bookings:updated', {
                venueId,
                action: 'table_status_changed',
                tableId: autoResult.rows[0].id,
                newStatus: 'cleaning',
                triggeredBy: 'auto',
                timestamp: new Date().toISOString(),
              });
            } catch { /* non-fatal */ }
          }
        }
      } catch { /* non-fatal */ }
    }

    const changePence = Math.max(0, newTotalPaid - ticket.total_pence);

    await logAudit(venueId, req.userId!, 'payment_received', 'payment', paymentResult.rows[0].id, {
      ticketId,
      method: parsed.data.method,
      amountPence: parsed.data.amountPence,
      tipPence: parsed.data.tipPence,
      ticketClosed,
    });

    emitPaymentUpdate(venueId, 'payment_received', ticketId, paymentResult.rows[0].id);
    if (ticketClosed) {
      emitTicketUpdate(venueId, 'closed', ticketId);

      // ── Cross-system sync on ticket close (booking completed + table cleaning runs on full pay above) ──
      // 1. Sync total + status to mirror order via direct column
      try {
        const ticketRow = await pool.query(
          `SELECT mirror_order_id, total_pence FROM pos_tickets WHERE id = $1`,
          [ticketId],
        );
        const mirrorOrderId = ticketRow.rows[0]?.mirror_order_id;
        if (mirrorOrderId) {
          // Mark mirror order as paid with final total
          await pool.query(
            `UPDATE orders SET status = 'paid', total_pence = $2, updated_at = NOW() WHERE id = $1 AND venue_id = $3`,
            [mirrorOrderId, ticketRow.rows[0].total_pence, venueId],
          );
          // Ensure all line items are synced (delete + re-insert for accuracy)
          await pool.query(`DELETE FROM order_items WHERE order_id = $1`, [mirrorOrderId]);
          const posItems = await pool.query(
            `SELECT name, qty, unit_price_pence FROM pos_ticket_items WHERE ticket_id = $1 AND voided = false`,
            [ticketId],
          );
          for (const pi of posItems.rows) {
            await pool.query(
              `INSERT INTO order_items (id, order_id, name, qty, unit_price_pence, line_total_pence, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())`,
              [mirrorOrderId, pi.name, pi.qty, pi.unit_price_pence, pi.qty * pi.unit_price_pence],
            );
          }
          getIo().to(`venue:${venueId}`).emit('orders:updated', { venueId, action: 'paid_from_pos', orderId: mirrorOrderId });
        }
      } catch { /* non-fatal */ }
    }

    res.status(201).json({
      success: true,
      data: {
        payment: paymentResult.rows[0],
        ticketClosed,
        totalPaid: newTotalPaid,
        remaining: Math.max(0, ticket.total_pence - newTotalPaid),
        changePence,
      },
    });
  } catch (err) {
    console.error('[POS] Payment error:', err);
    res.status(500).json({ success: false, error: 'Failed to process payment' });
  }
});

// GET /api/venues/:id/pos/tickets/:ticketId/payments
router.get('/pos/tickets/:ticketId/payments', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    // Verify ticket belongs to venue
    const ticketResult = await pool.query(
      `SELECT id FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const result = await pool.query(
      'SELECT * FROM pos_payments WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[POS] List payments error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
});

// ─── Refunds ─────────────────────────────────────────────────────────────────

// POST /api/venues/:id/pos/payments/:paymentId/refund
router.post('/pos/payments/:paymentId/refund', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = refundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { paymentId } = req.params;

    // Get original payment
    const paymentResult = await pool.query(
      `SELECT * FROM pos_payments WHERE id = $1 AND venue_id = $2`,
      [paymentId, venueId],
    );
    if (paymentResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }
    const payment = paymentResult.rows[0];

    if (payment.status !== 'completed') {
      res.status(409).json({ success: false, error: 'Can only refund completed payments' });
      return;
    }

    // Calculate total already refunded for this payment
    const refundedResult = await pool.query(
      `SELECT COALESCE(SUM(amount_pence), 0)::int AS refunded
       FROM pos_refunds WHERE payment_id = $1`,
      [paymentId],
    );
    const alreadyRefunded = refundedResult.rows[0].refunded;
    const maxRefundable = payment.amount_pence - alreadyRefunded;

    if (parsed.data.amountPence > maxRefundable) {
      res.status(422).json({
        success: false,
        error: `Refund amount exceeds refundable amount. Max refundable: ${maxRefundable} pence`,
      });
      return;
    }

    // Insert refund
    const refundResult = await pool.query(
      `INSERT INTO pos_refunds (
         id, payment_id, ticket_id, venue_id, amount_pence, reason,
         processed_by, created_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
       ) RETURNING *`,
      [paymentId, payment.ticket_id, venueId, parsed.data.amountPence, parsed.data.reason, req.userId],
    );

    // If fully refunded, mark payment as refunded
    const newTotalRefunded = alreadyRefunded + parsed.data.amountPence;
    if (newTotalRefunded >= payment.amount_pence) {
      await pool.query(
        `UPDATE pos_payments SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [paymentId],
      );
    }

    await logAudit(venueId, req.userId!, 'payment_refunded', 'refund', refundResult.rows[0].id, {
      paymentId,
      ticketId: payment.ticket_id,
      amountPence: parsed.data.amountPence,
      reason: parsed.data.reason,
    });

    emitPaymentUpdate(venueId, 'refund_processed', payment.ticket_id, paymentId);

    res.status(201).json({ success: true, data: refundResult.rows[0] });
  } catch (err) {
    console.error('[POS] Refund error:', err);
    res.status(500).json({ success: false, error: 'Failed to process refund' });
  }
});

// ─── Split Bill ──────────────────────────────────────────────────────────────

// POST /api/venues/:id/pos/tickets/:ticketId/split
router.post('/pos/tickets/:ticketId/split', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = splitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    // Verify original ticket
    const ticketResult = await pool.query(
      `SELECT * FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    const ticket = ticketResult.rows[0];
    if (!['open', 'parked'].includes(ticket.status)) {
      res.status(409).json({ success: false, error: 'Can only split open or parked tickets' });
      return;
    }

    // Check no payments made yet
    const paymentsCheck = await pool.query(
      `SELECT COUNT(*)::int AS count FROM pos_payments WHERE ticket_id = $1 AND status = 'completed'`,
      [ticketId],
    );
    if (paymentsCheck.rows[0].count > 0) {
      res.status(409).json({ success: false, error: 'Cannot split a ticket that has payments. Refund payments first.' });
      return;
    }

    const newTickets: unknown[] = [];

    // Get ticket prefix
    const configResult = await pool.query(
      `SELECT ticket_prefix FROM pos_config WHERE venue_id = $1`,
      [venueId],
    );
    const prefix = configResult.rows[0]?.ticket_prefix ?? 'TK';

    if (parsed.data.type === 'by_amount') {
      // Validate amounts sum to ticket total
      const amountsSum = parsed.data.amounts.reduce((a, b) => a + b, 0);
      if (amountsSum !== ticket.total_pence) {
        res.status(422).json({
          success: false,
          error: `Split amounts sum (${amountsSum}) must equal ticket total (${ticket.total_pence})`,
        });
        return;
      }

      // Get next ticket number
      const seqResult = await pool.query(
        `SELECT COALESCE(MAX(ticket_number), 0) AS max_num FROM pos_tickets WHERE venue_id = $1 AND session_id = $2`,
        [venueId, ticket.session_id],
      );
      let nextNum = seqResult.rows[0].max_num + 1;

      for (const amount of parsed.data.amounts) {
        const ticketRef = `${prefix}-${String(nextNum).padStart(4, '0')}`;
        const newTicketResult = await pool.query(
          `INSERT INTO pos_tickets (
             id, venue_id, session_id, ticket_number, ticket_ref, ticket_type,
             table_number, booking_date, booking_id, customer_name, covers, notes, status,
             subtotal_pence, tax_pence, service_charge_pence, discount_pence, total_pence,
             discount_type, discount_value, created_by, split_from_ticket_id, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5,
             $6, $7, $8, $9, 1, $10, 'open',
             $11, 0, 0, 0, $11,
             NULL, 0, $12, $13, NOW(), NOW()
           ) RETURNING *`,
          [
            venueId, ticket.session_id, nextNum, ticketRef, ticket.ticket_type,
            ticket.table_number, ticket.booking_date, ticket.booking_id, ticket.customer_name, ticket.notes,
            amount, req.userId, ticketId,
          ],
        );
        newTickets.push(newTicketResult.rows[0]);
        nextNum++;
      }
    } else {
      // Split by items
      const allItems = await pool.query(
        `SELECT * FROM pos_ticket_items WHERE ticket_id = $1 AND voided = false`,
        [ticketId],
      );
      const itemMap = new Map(allItems.rows.map((i: { id: string }) => [i.id, i]));

      // Validate all item IDs exist
      const allItemIds = parsed.data.groups.flat();
      for (const id of allItemIds) {
        if (!itemMap.has(id)) {
          res.status(422).json({ success: false, error: `Item ${id} not found on this ticket` });
          return;
        }
      }

      // Validate all items are accounted for
      const uniqueIds = new Set(allItemIds);
      if (uniqueIds.size !== allItemIds.length) {
        res.status(422).json({ success: false, error: 'Duplicate item IDs found across groups' });
        return;
      }

      const seqResult = await pool.query(
        `SELECT COALESCE(MAX(ticket_number), 0) AS max_num FROM pos_tickets WHERE venue_id = $1 AND session_id = $2`,
        [venueId, ticket.session_id],
      );
      let nextNum = seqResult.rows[0].max_num + 1;

      for (const group of parsed.data.groups) {
        const ticketRef = `${prefix}-${String(nextNum).padStart(4, '0')}`;
        const newTicketResult = await pool.query(
          `INSERT INTO pos_tickets (
             id, venue_id, session_id, ticket_number, ticket_ref, ticket_type,
             table_number, booking_date, booking_id, customer_name, covers, notes, status,
             subtotal_pence, tax_pence, service_charge_pence, discount_pence, total_pence,
             discount_type, discount_value, created_by, split_from_ticket_id, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5,
             $6, $7, $8, $9, 1, $10, 'open',
             0, 0, 0, 0, 0,
             NULL, 0, $11, $12, NOW(), NOW()
           ) RETURNING *`,
          [
            venueId, ticket.session_id, nextNum, ticketRef, ticket.ticket_type,
            ticket.table_number, ticket.booking_date, ticket.booking_id, ticket.customer_name, ticket.notes,
            req.userId, ticketId,
          ],
        );
        const newTicket = newTicketResult.rows[0];

        // Move items to new ticket
        for (const itemId of group) {
          await pool.query(
            `UPDATE pos_ticket_items SET ticket_id = $1, updated_at = NOW() WHERE id = $2`,
            [newTicket.id, itemId],
          );
        }

        // Recalculate new ticket totals
        await recalcTicketTotals(newTicket.id);

        // Fetch updated ticket
        const updatedTicket = await pool.query('SELECT * FROM pos_tickets WHERE id = $1', [newTicket.id]);
        newTickets.push(updatedTicket.rows[0]);

        nextNum++;
      }
    }

    // Void the original ticket
    await pool.query(
      `UPDATE pos_tickets SET status = 'voided', void_reason = 'Split into new tickets', voided_by = $2, voided_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [ticketId, req.userId],
    );

    await logAudit(venueId, req.userId!, 'ticket_split', 'ticket', ticketId, {
      type: parsed.data.type,
      newTicketCount: newTickets.length,
    });
    emitTicketUpdate(venueId, 'split', ticketId);

    res.status(201).json({ success: true, data: { originalTicketId: ticketId, newTickets } });
  } catch (err) {
    console.error('[POS] Split ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to split ticket' });
  }
});

// ─── Discounts ───────────────────────────────────────────────────────────────

// POST /api/venues/:id/pos/tickets/:ticketId/discount
router.post('/pos/tickets/:ticketId/discount', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = discountSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { ticketId } = req.params;

    // Verify ticket
    const ticketResult = await pool.query(
      `SELECT * FROM pos_tickets WHERE id = $1 AND venue_id = $2`,
      [ticketId, venueId],
    );
    if (ticketResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }
    if (!['open', 'parked'].includes(ticketResult.rows[0].status)) {
      res.status(409).json({ success: false, error: 'Can only apply discounts to open or parked tickets' });
      return;
    }

    // Validate percentage doesn't exceed 100
    if (parsed.data.type === 'percentage' && parsed.data.value > 100) {
      res.status(422).json({ success: false, error: 'Percentage discount cannot exceed 100%' });
      return;
    }

    // Validate fixed discount doesn't exceed subtotal
    if (parsed.data.type === 'fixed' && parsed.data.value > ticketResult.rows[0].subtotal_pence) {
      res.status(422).json({ success: false, error: 'Fixed discount cannot exceed ticket subtotal' });
      return;
    }

    // Apply discount
    await pool.query(
      `UPDATE pos_tickets SET discount_type = $2, discount_value = $3, discount_reason = $4, updated_at = NOW()
       WHERE id = $1`,
      [ticketId, parsed.data.type, parsed.data.value, parsed.data.reason ?? null],
    );

    // Recalculate totals
    const totals = await recalcTicketTotals(ticketId);

    // Fetch updated ticket
    const updatedTicket = await pool.query('SELECT * FROM pos_tickets WHERE id = $1', [ticketId]);

    await logAudit(venueId, req.userId!, 'discount_applied', 'ticket', ticketId, {
      type: parsed.data.type,
      value: parsed.data.value,
      reason: parsed.data.reason,
      newTotal: totals.totalPence,
    });
    emitTicketUpdate(venueId, 'discount_applied', ticketId);

    res.json({ success: true, data: { ticket: updatedTicket.rows[0], totals } });
  } catch (err) {
    console.error('[POS] Apply discount error:', err);
    res.status(500).json({ success: false, error: 'Failed to apply discount' });
  }
});

// ─── Audit Log ───────────────────────────────────────────────────────────────

// GET /api/venues/:id/pos/audit
router.get('/pos/audit', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['venue_id = $1'];
    const values: unknown[] = [venueId];
    let paramIndex = 2;

    if (req.query.action && typeof req.query.action === 'string') {
      conditions.push(`action = $${paramIndex}`);
      values.push(req.query.action);
      paramIndex++;
    }

    if (req.query.entityType && typeof req.query.entityType === 'string') {
      conditions.push(`entity_type = $${paramIndex}`);
      values.push(req.query.entityType);
      paramIndex++;
    }

    if (req.query.from && typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) {
      conditions.push(`created_at >= $${paramIndex}`);
      values.push(`${req.query.from}T00:00:00.000Z`);
      paramIndex++;
    }

    if (req.query.to && typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) {
      conditions.push(`created_at < $${paramIndex}`);
      values.push(`${req.query.to}T23:59:59.999Z`);
      paramIndex++;
    }

    const where = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM pos_audit_log WHERE ${where}`,
      values,
    );
    const total = countResult.rows[0].total;

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM pos_audit_log WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      values,
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[POS] List audit log error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch audit log' });
  }
});

// ─── POS Menu ────────────────────────────────────────────────────────────────

// GET /api/venues/:id/pos/menu
router.get('/pos/menu', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const venueId = req.params.id;

    // Get menu items with category info, sorted by display order
    const itemsResult = await pool.query(
      `SELECT
         mi.id,
         mi.name,
         mi.description,
         mi.current_price AS price_pence,
         mi.image_url,
         mi.is_available,
         mi.display_order,
         mc.id AS category_id,
         mc.name AS category_name,
         mc.display_order AS category_display_order
       FROM menu_items mi
       LEFT JOIN menu_categories mc ON mi.category_id = mc.id
       WHERE mi.venue_id = $1
       ORDER BY mc.display_order ASC NULLS LAST, mi.display_order ASC, mi.name ASC`,
      [venueId],
    );

    // Check inventory stock levels for items that have ingredient mappings.
    // Uses product_ingredients.product_id (→ menu_items.id) and
    // product_ingredients.inventory_item_id (→ inventory_items.id).
    // For each menu item, the bottleneck ingredient (lowest servings remaining) decides stock status.
    // Unit conversion (g→kg, ml→l etc.) is applied so recipe and inventory units don't need to match.
    const stockResult = await pool.query(
      `SELECT
         pi.product_id AS menu_item_id,
         CASE
           WHEN MIN(ii.on_hand::numeric / NULLIF(${UNIT_CONVERT_SQL}, 0)) <= 0 THEN 'out_of_stock'
           WHEN MIN(ii.on_hand::numeric / NULLIF(${UNIT_CONVERT_SQL}, 0)) <= 5 THEN 'low_stock'
           ELSE 'in_stock'
         END AS stock_status
       FROM product_ingredients pi
       JOIN inventory_items ii ON ii.id = pi.inventory_item_id
       WHERE (pi.venue_id = $1 OR pi.venue_id IS NULL)
         AND pi.inventory_item_id IS NOT NULL
       GROUP BY pi.product_id`,
      [venueId],
    );
    const stockMap = new Map(stockResult.rows.map((r: { menu_item_id: string; stock_status: string }) => [r.menu_item_id, r.stock_status]));

    // Group by category
    const categories = new Map<string | null, { id: string | null; name: string; displayOrder: number; items: unknown[] }>();

    for (const item of itemsResult.rows) {
      const catId = item.category_id ?? null;
      if (!categories.has(catId)) {
        categories.set(catId, {
          id: catId,
          name: item.category_name ?? 'Uncategorised',
          displayOrder: item.category_display_order ?? 999,
          items: [],
        });
      }
      categories.get(catId)!.items.push({
        id: item.id,
        name: item.name,
        description: item.description,
        pricePence: item.price_pence,
        imageUrl: item.image_url,
        isAvailable: item.is_available,
        displayOrder: item.display_order,
        stockStatus: stockMap.get(item.id) ?? 'in_stock',
      });
    }

    const grouped = Array.from(categories.values()).sort((a, b) => a.displayOrder - b.displayOrder);

    res.json({ success: true, data: grouped });
  } catch (err) {
    console.error('[POS] Get menu error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch POS menu' });
  }
});

export default router;
