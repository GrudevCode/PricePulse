import { Router, Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { getPool } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { requireVenueAccess } from '../../middleware/venueAccess';
import { getIo } from '../../lib/socket';
import { sendBookingConfirmation, sendBookingCancellation } from '../../services/emailService';

const router = Router({ mergeParams: true });

const tableShapeValues = ['round', 'square', 'rect-h', 'rect-v'] as const;
const tableStatusValues = ['available', 'occupied', 'reserved', 'cleaning'] as const;
const bookingStatusValues = ['confirmed', 'pending', 'seated', 'completed', 'cancelled', 'no-show'] as const;

const tableSchema = z.object({
  id: z.string().uuid().optional(),
  number: z.string().min(1).max(50),
  section: z.string().min(1).max(100),
  capacity: z.number().int().positive().max(50),
  shape: z.enum(tableShapeValues),
  x: z.number().int().min(0).max(5000),
  y: z.number().int().min(0).max(5000),
  w: z.number().int().min(40).max(1000).nullable().optional(),
  h: z.number().int().min(40).max(1000).nullable().optional(),
  status: z.enum(tableStatusValues).default('available'),
  autoStatus: z.boolean().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  displayOrder: z.number().int().min(0).default(0),
});

const replaceTablesSchema = z.object({
  /** Empty array = clear floor plan so new venues can start from a blank canvas. */
  tables: z.array(tableSchema).min(0),
});

const createBookingSchema = z.object({
  tableId: z.string().uuid().optional().nullable(),
  tableNumber: z.string().min(1).max(50),
  section: z.string().min(1).max(100),
  guestName: z.string().min(1).max(255),
  partySize: z.number().int().positive().max(50),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().min(15).max(600).default(90),
  status: z.enum(bookingStatusValues).default('confirmed'),
  notes: z.string().max(2000).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
});
const updateBookingSchema = createBookingSchema.partial();
const bookingOrderHistorySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tableNumber: z.string().max(50).optional(),
  bookingId: z.string().uuid().optional(),
});

function getDateOrToday(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

// ─── Helper: emit table status change event ──────────────────────────────────

function emitTableStatusChange(
  venueId: string,
  tableId: string,
  newStatus: string,
  triggeredBy: 'auto' | 'manual',
) {
  try {
    getIo().to(`venue:${venueId}`).emit('bookings:updated', {
      venueId,
      action: 'table_status_changed',
      tableId,
      newStatus,
      triggeredBy,
      timestamp: new Date().toISOString(),
    });
  } catch { /* non-fatal */ }
}

// GET /api/venues/:id/tables
router.get('/tables', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tables = await db.query.venueTables.findMany({
      where: eq(schema.venueTables.venueId, req.params.id),
      orderBy: [asc(schema.venueTables.displayOrder), asc(schema.venueTables.number)],
    });
    res.json({ success: true, data: tables });
  } catch (err) {
    console.error('[Bookings] List tables error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tables' });
  }
});

// PUT /api/venues/:id/tables (replace full floor layout)
router.put('/tables', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = replaceTablesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const db = getDb();
    const venueId = req.params.id;

    // Preserve auto_status and cleaning_started_at from existing tables before delete
    const existingResult = await pool.query(
      `SELECT number, auto_status, cleaning_started_at FROM venue_tables WHERE venue_id = $1`,
      [venueId],
    );
    const existingByNumber = new Map<string, { autoStatus: boolean; cleaningStartedAt: Date | null }>();
    for (const row of existingResult.rows) {
      existingByNumber.set(row.number, {
        autoStatus: row.auto_status ?? false,
        cleaningStartedAt: row.cleaning_started_at ?? null,
      });
    }

    await db.delete(schema.venueTables).where(eq(schema.venueTables.venueId, venueId));
    await db.update(schema.tableBookings)
      .set({ tableId: null, updatedAt: new Date() })
      .where(eq(schema.tableBookings.venueId, venueId));

    const inserted
      = parsed.data.tables.length === 0
        ? []
        : await db.insert(schema.venueTables).values(
            parsed.data.tables.map((t) => {
              const prev = existingByNumber.get(t.number);
              return {
                id: t.id,
                venueId,
                number: t.number,
                section: t.section,
                capacity: t.capacity,
                shape: t.shape,
                x: t.x,
                y: t.y,
                w: t.w ?? null,
                h: t.h ?? null,
                status: t.status,
                autoStatus: t.autoStatus ?? prev?.autoStatus ?? false,
                cleaningStartedAt: prev?.cleaningStartedAt ?? null,
                color: t.color ?? null,
                notes: t.notes ?? null,
                displayOrder: t.displayOrder,
              };
            }),
          ).returning();

    // Keep existing bookings linked to new table IDs by table number.
    for (const row of inserted) {
      await db.update(schema.tableBookings)
        .set({ tableId: row.id, section: row.section, updatedAt: new Date() })
        .where(and(
          eq(schema.tableBookings.venueId, venueId),
          eq(schema.tableBookings.tableNumber, row.number),
        ));
    }

    try {
      getIo().to(`venue:${venueId}`).emit('bookings:updated', { venueId, action: 'tables_saved' });
    } catch {
      // Ignore websocket emission failures.
    }

    res.json({ success: true, data: inserted });
  } catch (err) {
    console.error('[Bookings] Replace tables error:', err);
    res.status(500).json({ success: false, error: 'Failed to save floor layout' });
  }
});

// PATCH /api/venues/:id/tables/:tableId/auto-status — toggle auto/manual per table
router.patch('/tables/:tableId/auto-status', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({ autoStatus: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'autoStatus (boolean) is required' });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { tableId } = req.params;

    const result = await pool.query(
      `UPDATE venue_tables SET auto_status = $1, updated_at = NOW()
       WHERE id = $2 AND venue_id = $3
       RETURNING *`,
      [parsed.data.autoStatus, tableId, venueId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Table not found' });
      return;
    }

    try {
      getIo().to(`venue:${venueId}`).emit('bookings:updated', {
        venueId,
        action: 'auto_status_toggled',
        tableId,
        autoStatus: parsed.data.autoStatus,
      });
    } catch { /* non-fatal */ }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Bookings] Toggle auto status error:', err);
    res.status(500).json({ success: false, error: 'Failed to toggle auto status' });
  }
});

// GET /api/venues/:id/cleaning-timer — get venue cleaning timer setting
router.get('/cleaning-timer', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT cleaning_timer_minutes FROM venues WHERE id = $1`,
      [req.params.id],
    );
    const minutes = result.rows[0]?.cleaning_timer_minutes ?? 15;
    res.json({ success: true, data: { cleaningTimerMinutes: minutes } });
  } catch (err) {
    console.error('[Bookings] Get cleaning timer error:', err);
    res.status(500).json({ success: false, error: 'Failed to get cleaning timer' });
  }
});

// PATCH /api/venues/:id/cleaning-timer — set venue cleaning timer duration
router.patch('/cleaning-timer', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      cleaningTimerMinutes: z.number().int().min(1).max(120),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'cleaningTimerMinutes (1-120) is required' });
      return;
    }

    const pool = getPool();
    await pool.query(
      `UPDATE venues SET cleaning_timer_minutes = $1, updated_at = NOW() WHERE id = $2`,
      [parsed.data.cleaningTimerMinutes, req.params.id],
    );

    try {
      getIo().to(`venue:${req.params.id}`).emit('bookings:updated', {
        venueId: req.params.id,
        action: 'cleaning_timer_updated',
        cleaningTimerMinutes: parsed.data.cleaningTimerMinutes,
      });
    } catch { /* non-fatal */ }

    res.json({ success: true, data: { cleaningTimerMinutes: parsed.data.cleaningTimerMinutes } });
  } catch (err) {
    console.error('[Bookings] Set cleaning timer error:', err);
    res.status(500).json({ success: false, error: 'Failed to set cleaning timer' });
  }
});

// PATCH /api/venues/:id/tables/:tableId/status — manual or auto status update
router.patch('/tables/:tableId/status', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      status: z.enum(tableStatusValues),
      triggeredBy: z.enum(['auto', 'manual']).default('manual'),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { tableId } = req.params;

    const cleaningStartedAt = parsed.data.status === 'cleaning' ? 'NOW()' : 'NULL';
    const result = await pool.query(
      `UPDATE venue_tables
       SET status = $1, cleaning_started_at = ${cleaningStartedAt}, updated_at = NOW()
       WHERE id = $2 AND venue_id = $3
       RETURNING *`,
      [parsed.data.status, tableId, venueId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Table not found' });
      return;
    }

    emitTableStatusChange(venueId, tableId, parsed.data.status, parsed.data.triggeredBy);

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Bookings] Update table status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update table status' });
  }
});

// GET /api/venues/:id/bookings?date=YYYY-MM-DD
router.get('/bookings', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const hasDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date);
    const date = hasDate ? req.query.date : null;
    const bookings = await db.query.tableBookings.findMany({
      where: hasDate
        ? and(
          eq(schema.tableBookings.venueId, req.params.id),
          eq(schema.tableBookings.bookingDate, date as string),
        )
        : eq(schema.tableBookings.venueId, req.params.id),
      orderBy: [asc(schema.tableBookings.startTime), asc(schema.tableBookings.createdAt)],
    });
    res.json({ success: true, data: bookings, date: date ?? 'all' });
  } catch (err) {
    console.error('[Bookings] List bookings error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

// GET /api/venues/:id/bookings/order-history?date=YYYY-MM-DD&tableNumber=...&bookingId=...
router.get('/bookings/order-history', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = bookingOrderHistorySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const pool = getPool();
    const venueId = req.params.id;
    const { date, tableNumber, bookingId } = parsed.data;

    const values: unknown[] = [venueId, date];
    const where: string[] = ['t.venue_id = $1', 'COALESCE(t.booking_date, t.created_at::date) = $2::date'];
    let paramIndex = 3;

    if (tableNumber) {
      where.push(`t.table_number = $${paramIndex}`);
      values.push(tableNumber);
      paramIndex++;
    }
    if (bookingId) {
      where.push(`t.booking_id = $${paramIndex}`);
      values.push(bookingId);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT
         t.id,
         t.ticket_ref,
         t.status,
         t.total_pence AS "totalPence",
         t.table_number AS "tableNumber",
         t.booking_id AS "bookingId",
         COALESCE(t.booking_date, t.created_at::date)::text AS "bookingDate",
         t.closed_at AS "closedAt",
         COALESCE(MAX(p.processed_at), MAX(p.created_at)) AS "paidAt",
         COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount_pence ELSE 0 END), 0)::int AS "paidTotalPence"
       FROM pos_tickets t
       LEFT JOIN pos_payments p ON p.ticket_id = t.id
       WHERE ${where.join(' AND ')}
       GROUP BY t.id
       ORDER BY COALESCE(t.closed_at, t.created_at) DESC`,
      values,
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Bookings] Order history error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch order history' });
  }
});

// POST /api/venues/:id/bookings
router.post('/bookings', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const db = getDb();
    const existing = await db.query.tableBookings.findFirst({
      where: and(
        eq(schema.tableBookings.venueId, req.params.id),
        eq(schema.tableBookings.tableNumber, parsed.data.tableNumber),
        eq(schema.tableBookings.bookingDate, parsed.data.bookingDate),
        eq(schema.tableBookings.startTime, parsed.data.startTime),
      ),
    });
    if (existing) {
      res.status(409).json({ success: false, error: 'Booking already exists for this table/time' });
      return;
    }
    const [created] = await db.insert(schema.tableBookings).values({
      venueId: req.params.id,
      tableId: parsed.data.tableId ?? null,
      tableNumber: parsed.data.tableNumber,
      section: parsed.data.section,
      guestName: parsed.data.guestName,
      partySize: parsed.data.partySize,
      bookingDate: parsed.data.bookingDate,
      startTime: parsed.data.startTime,
      duration: parsed.data.duration,
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
    }).returning();

    try {
      getIo().to(`venue:${req.params.id}`).emit('bookings:updated', { venueId: req.params.id, action: 'created', bookingId: created.id });
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, reason: 'booking_changed' });
    } catch {
      // Ignore websocket emission failures.
    }

    // Send confirmation email if guest provided an email (fire-and-forget)
    if (created.email && process.env.RESEND_API_KEY) {
      const venue = await getDb().query.venues.findFirst({ where: eq(schema.venues.id, req.params.id) });
      sendBookingConfirmation({
        to:          created.email,
        guestName:   created.guestName,
        venueName:   venue?.name ?? 'The Restaurant',
        tableNumber: created.tableNumber,
        section:     created.section,
        partySize:   created.partySize,
        bookingDate: created.bookingDate,
        startTime:   created.startTime,
        notes:       created.notes,
      }).catch((err) => console.error('[Email] Booking confirmation failed:', err));
    }

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('[Bookings] Create booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
});

// PATCH /api/venues/:id/bookings/:bookingId
router.patch('/bookings/:bookingId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.tableId !== undefined) updateData.tableId = parsed.data.tableId;
    if (parsed.data.tableNumber !== undefined) updateData.tableNumber = parsed.data.tableNumber;
    if (parsed.data.section !== undefined) updateData.section = parsed.data.section;
    if (parsed.data.guestName !== undefined) updateData.guestName = parsed.data.guestName;
    if (parsed.data.partySize !== undefined) updateData.partySize = parsed.data.partySize;
    if (parsed.data.bookingDate !== undefined) updateData.bookingDate = parsed.data.bookingDate;
    if (parsed.data.startTime !== undefined) updateData.startTime = parsed.data.startTime;
    if (parsed.data.duration !== undefined) updateData.duration = parsed.data.duration;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.phone !== undefined) updateData.phone = parsed.data.phone;
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email;

    const db = getDb();
    const [updated] = await db.update(schema.tableBookings)
      .set(updateData)
      .where(and(
        eq(schema.tableBookings.id, req.params.bookingId),
        eq(schema.tableBookings.venueId, req.params.id),
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }

    try {
      getIo().to(`venue:${req.params.id}`).emit('bookings:updated', { venueId: req.params.id, action: 'updated', bookingId: updated.id });
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, reason: 'booking_changed' });
    } catch {
      // Ignore websocket emission failures.
    }

    // Send cancellation email if status was changed to cancelled
    if (parsed.data.status === 'cancelled' && updated.email && process.env.RESEND_API_KEY) {
      const venue = await getDb().query.venues.findFirst({ where: eq(schema.venues.id, req.params.id) });
      sendBookingCancellation({
        to:          updated.email,
        guestName:   updated.guestName,
        venueName:   venue?.name ?? 'The Restaurant',
        bookingDate: updated.bookingDate,
        startTime:   updated.startTime,
      }).catch((err) => console.error('[Email] Cancellation email failed:', err));
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Bookings] Update booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
});

// DELETE /api/venues/:id/bookings/:bookingId
router.delete('/bookings/:bookingId', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    await db.delete(schema.tableBookings)
      .where(and(
        eq(schema.tableBookings.id, req.params.bookingId),
        eq(schema.tableBookings.venueId, req.params.id),
      ));

    try {
      getIo().to(`venue:${req.params.id}`).emit('bookings:updated', { venueId: req.params.id, action: 'deleted', bookingId: req.params.bookingId });
      getIo().to(`venue:${req.params.id}`).emit('inventory:updated', { venueId: req.params.id, reason: 'booking_changed' });
    } catch {
      // Ignore websocket emission failures.
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Bookings] Delete booking error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete booking' });
  }
});

// GET /api/venues/:id/booking-state?date=YYYY-MM-DD
router.get('/booking-state', requireAuth, requireVenueAccess, async (req: AuthRequest, res: Response) => {
  try {
    const pool = getPool();
    const db = getDb();
    const venueId = req.params.id;
    const date = getDateOrToday(req.query.date);

    // Fetch venue cleaning timer setting
    const venueResult = await pool.query(
      `SELECT cleaning_timer_minutes FROM venues WHERE id = $1`,
      [venueId],
    );
    const cleaningTimerMinutes = venueResult.rows[0]?.cleaning_timer_minutes ?? 15;

    const [tables, bookings] = await Promise.all([
      db.query.venueTables.findMany({
        where: eq(schema.venueTables.venueId, venueId),
        orderBy: [asc(schema.venueTables.displayOrder), asc(schema.venueTables.number)],
      }),
      db.query.tableBookings.findMany({
        where: and(
          eq(schema.tableBookings.venueId, venueId),
          eq(schema.tableBookings.bookingDate, date),
        ),
        orderBy: [asc(schema.tableBookings.startTime), asc(schema.tableBookings.createdAt)],
      }),
    ]);

    // Auto-expire cleaning timers: if a table is in 'cleaning' with auto_status ON
    // and the timer has expired, transition it to 'available'.
    const now = new Date();
    const tablesToExpire: string[] = [];
    for (const t of tables) {
      if (t.status === 'cleaning' && t.cleaningStartedAt) {
        const elapsedMs = now.getTime() - new Date(t.cleaningStartedAt).getTime();
        const timerMs = cleaningTimerMinutes * 60 * 1000;
        if (elapsedMs >= timerMs) {
          tablesToExpire.push(t.id);
        }
      }
    }
    if (tablesToExpire.length > 0) {
      // Batch update expired cleaning tables to available
      await pool.query(
        `UPDATE venue_tables
         SET status = 'available', cleaning_started_at = NULL, updated_at = NOW()
         WHERE id = ANY($1::uuid[]) AND venue_id = $2`,
        [tablesToExpire, venueId],
      );
      // Update the in-memory tables to reflect the change
      for (const t of tables) {
        if (tablesToExpire.includes(t.id)) {
          (t as any).status = 'available';
          (t as any).cleaningStartedAt = null;
        }
      }
      // Emit status change events for expired tables
      for (const tid of tablesToExpire) {
        emitTableStatusChange(venueId, tid, 'available', 'auto');
      }
    }

    /** Prefer tableId so renames / number collisions cannot attach one booking to many tables */
    const byTableId = new Map<string, typeof bookings>();
    const byTableNumber = new Map<string, typeof bookings>();
    for (const b of bookings) {
      if (b.tableId) {
        const arr = byTableId.get(b.tableId) ?? [];
        arr.push(b);
        byTableId.set(b.tableId, arr);
      }
      const arrN = byTableNumber.get(b.tableNumber) ?? [];
      arrN.push(b);
      byTableNumber.set(b.tableNumber, arrN);
    }

    const mapped = tables.map((t) => {
      const b = byTableId.get(t.id) ?? byTableNumber.get(t.number) ?? [];
      const seated = b.find((x) => x.status === 'seated');
      const reserved = b.find((x) => x.status === 'confirmed' || x.status === 'pending');
      const primary = seated ?? reserved ?? b[0];
      // POS / floor plan can set venue_tables.status to occupied/cleaning while the
      // calendar row is still confirmed — do not downgrade to reserved/yellow.
      let status: (typeof t)['status'];
      if (t.status === 'cleaning') {
        status = 'cleaning';
      } else if (t.status === 'occupied') {
        status = 'occupied';
      } else {
        status = seated ? 'occupied' : reserved ? 'reserved' : t.status;
      }
      return {
        ...t,
        status,
        guestName: primary?.guestName ?? null,
        partySize: primary?.partySize ?? null,
        bookingTime: reserved?.startTime ?? null,
        seatedAt: seated?.startTime ?? null,
      };
    });

    res.json({
      success: true,
      data: {
        date,
        tables: mapped,
        bookings,
        cleaningTimerMinutes,
      },
    });
  } catch (err) {
    console.error('[Bookings] Booking state error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch booking state' });
  }
});

export default router;
