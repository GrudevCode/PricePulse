import { Router, Response } from 'express';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { getIo } from '../../lib/socket';

const router = Router({ mergeParams: true });

const orderStatusValues = ['new', 'preparing', 'served', 'paid', 'cancelled'] as const;
const itemSchema = z.object({
  name: z.string().min(1).max(255),
  qty: z.number().int().positive().max(999),
  unitPricePence: z.number().int().min(0),
});
const createOrderSchema = z.object({
  tableNumber: z.string().max(50).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  covers: z.number().int().positive().max(100).default(1),
  status: z.enum(orderStatusValues).default('new'),
  notes: z.string().max(2000).optional().nullable(),
  orderedAt: z.string().datetime().optional(),
  items: z.array(itemSchema).min(1),
});
const updateOrderSchema = z.object({
  tableNumber: z.string().max(50).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  covers: z.number().int().positive().max(100).optional(),
  status: z.enum(orderStatusValues).optional(),
  notes: z.string().max(2000).optional().nullable(),
});
const appendItemsSchema = z.object({
  items: z.array(itemSchema).min(1),
});

// GET /api/venues/:id/orders?date=YYYY-MM-DD
router.get('/orders', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
    const where = date
      ? and(
        eq(schema.orders.venueId, req.params.id),
        gte(schema.orders.orderedAt, new Date(`${date}T00:00:00.000Z`)),
        lt(schema.orders.orderedAt, new Date(`${date}T23:59:59.999Z`)),
      )
      : eq(schema.orders.venueId, req.params.id);

    const orders = await db.query.orders.findMany({
      where,
      orderBy: [desc(schema.orders.orderedAt), asc(schema.orders.createdAt)],
    });

    const items = orders.length
      ? await db.query.orderItems.findMany({
        where: (fields, { inArray }) => inArray(fields.orderId, orders.map((o) => o.id)),
      })
      : [];
    const byOrder = new Map<string, typeof items>();
    for (const it of items) {
      const arr = byOrder.get(it.orderId) ?? [];
      arr.push(it);
      byOrder.set(it.orderId, arr);
    }
    res.json({ success: true, data: orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] })) });
  } catch (err) {
    console.error('[Orders] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

// POST /api/venues/:id/orders
router.post('/orders', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const totalPence = parsed.data.items.reduce((s, i) => s + (i.qty * i.unitPricePence), 0);
    const [created] = await db.insert(schema.orders).values({
      venueId: req.params.id,
      tableNumber: parsed.data.tableNumber ?? null,
      customerName: parsed.data.customerName ?? null,
      covers: parsed.data.covers,
      status: parsed.data.status,
      totalPence,
      notes: parsed.data.notes ?? null,
      orderedAt: parsed.data.orderedAt ? new Date(parsed.data.orderedAt) : new Date(),
    }).returning();
    await db.insert(schema.orderItems).values(
      parsed.data.items.map((i) => ({
        orderId: created.id,
        name: i.name,
        qty: i.qty,
        unitPricePence: i.unitPricePence,
        lineTotalPence: i.qty * i.unitPricePence,
      })),
    );
    const full = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, created.id) });
    try {
      getIo().to(`venue:${req.params.id}`).emit('orders:updated', { venueId: req.params.id, action: 'created', orderId: created.id });
    } catch {}
    res.status(201).json({ success: true, data: { ...created, items: full } });
  } catch (err) {
    console.error('[Orders] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create order' });
  }
});

// PATCH /api/venues/:id/orders/:orderId
router.patch('/orders/:orderId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.tableNumber !== undefined) data.tableNumber = parsed.data.tableNumber;
    if (parsed.data.customerName !== undefined) data.customerName = parsed.data.customerName;
    if (parsed.data.covers !== undefined) data.covers = parsed.data.covers;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    const db = getDb();
    const [updated] = await db.update(schema.orders).set(data).where(and(
      eq(schema.orders.id, req.params.orderId),
      eq(schema.orders.venueId, req.params.id),
    )).returning();
    if (!updated) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    try {
      getIo().to(`venue:${req.params.id}`).emit('orders:updated', { venueId: req.params.id, action: 'updated', orderId: updated.id });
    } catch {}
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Orders] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update order' });
  }
});

// POST /api/venues/:id/orders/:orderId/items (append items to preparing order)
router.post('/orders/:orderId/items', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = appendItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const order = await db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, req.params.orderId),
        eq(schema.orders.venueId, req.params.id),
      ),
    });
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    if (order.status !== 'preparing') {
      res.status(409).json({ success: false, error: 'Can only add items to preparing orders' });
      return;
    }

    const addedTotal = parsed.data.items.reduce((s, i) => s + (i.qty * i.unitPricePence), 0);
    await db.insert(schema.orderItems).values(
      parsed.data.items.map((i) => ({
        orderId: order.id,
        name: i.name,
        qty: i.qty,
        unitPricePence: i.unitPricePence,
        lineTotalPence: i.qty * i.unitPricePence,
      })),
    );
    const [updated] = await db.update(schema.orders).set({
      totalPence: (order.totalPence ?? 0) + addedTotal,
      updatedAt: new Date(),
    }).where(eq(schema.orders.id, order.id)).returning();
    const items = await db.query.orderItems.findMany({ where: eq(schema.orderItems.orderId, order.id) });
    try {
      getIo().to(`venue:${req.params.id}`).emit('orders:updated', { venueId: req.params.id, action: 'items_added', orderId: order.id });
    } catch {}
    res.json({ success: true, data: { ...updated, items } });
  } catch (err) {
    console.error('[Orders] Append items error:', err);
    res.status(500).json({ success: false, error: 'Failed to append items' });
  }
});

// DELETE /api/venues/:id/orders/:orderId
router.delete('/orders/:orderId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.delete(schema.orders).where(and(
      eq(schema.orders.id, req.params.orderId),
      eq(schema.orders.venueId, req.params.id),
    ));
    try {
      getIo().to(`venue:${req.params.id}`).emit('orders:updated', { venueId: req.params.id, action: 'deleted', orderId: req.params.orderId });
    } catch {}
    res.json({ success: true });
  } catch (err) {
    console.error('[Orders] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete order' });
  }
});

export default router;
