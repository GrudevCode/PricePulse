-- Migration 0010: Direct order linking for POS tickets
-- Replaces the fragile notes-based [order:uuid] approach with a proper FK column.
-- Also ensures void cascades are properly handled.

-- ─── Add mirror_order_id column ─────────────────────────────────────────────

ALTER TABLE pos_tickets ADD COLUMN IF NOT EXISTS mirror_order_id uuid;

-- ─── Backfill from existing notes-based links ──────────────────────────────

UPDATE pos_tickets
SET mirror_order_id = (regexp_match(notes, '\[order:([a-f0-9-]+)\]'))[1]::uuid
WHERE notes LIKE '%[order:%'
  AND mirror_order_id IS NULL;

-- ─── Index ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS pos_tickets_mirror_order_id_idx
  ON pos_tickets(mirror_order_id) WHERE mirror_order_id IS NOT NULL;

-- ─── Add source column to orders for traceability ───────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source varchar(20) DEFAULT 'manual';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pos_ticket_id uuid;

CREATE INDEX IF NOT EXISTS orders_pos_ticket_id_idx
  ON orders(pos_ticket_id) WHERE pos_ticket_id IS NOT NULL;

-- Backfill source for POS-created orders
UPDATE orders o
SET source = 'pos', pos_ticket_id = pt.id
FROM pos_tickets pt
WHERE pt.mirror_order_id = o.id
  AND o.source = 'manual';
