-- POS system migration
-- Adds: pos_sessions, pos_tickets, pos_ticket_items, pos_payments,
--        pos_refunds, pos_audit_log, pos_config

-- ─── POS Sessions (shift management) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "opened_by" uuid NOT NULL REFERENCES "users"("id"),
  "closed_by" uuid REFERENCES "users"("id"),
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  "opening_float_pence" integer NOT NULL DEFAULT 0,
  "closing_cash_pence" integer,
  "expected_cash_pence" integer,
  "total_sales_pence" integer NOT NULL DEFAULT 0,
  "total_refunds_pence" integer NOT NULL DEFAULT 0,
  "ticket_count" integer NOT NULL DEFAULT 0,
  "notes" text,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_sessions_venue_id_idx" ON "pos_sessions"("venue_id");
CREATE INDEX IF NOT EXISTS "pos_sessions_opened_at_idx" ON "pos_sessions"("venue_id", "opened_at");
CREATE INDEX IF NOT EXISTS "pos_sessions_status_idx" ON "pos_sessions"("venue_id", "status");

-- ─── Ticket number sequence ─────────────────────────────────────────────────
-- Auto-incrementing ticket numbers across all venues (unique per DB)

CREATE SEQUENCE IF NOT EXISTS pos_ticket_number_seq START 1;

-- ─── POS Tickets (orders / sales) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "pos_sessions"("id"),
  "ticket_number" integer NOT NULL DEFAULT nextval('pos_ticket_number_seq'),
  "table_number" varchar(50),
  "customer_name" varchar(255),
  "covers" integer DEFAULT 1,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "subtotal_pence" integer NOT NULL DEFAULT 0,
  "discount_pence" integer NOT NULL DEFAULT 0,
  "discount_type" varchar(20),
  "discount_value" decimal(10,2),
  "tax_pence" integer NOT NULL DEFAULT 0,
  "service_charge_pence" integer NOT NULL DEFAULT 0,
  "total_pence" integer NOT NULL DEFAULT 0,
  "notes" text,
  "parked_at" timestamptz,
  "closed_at" timestamptz,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_tickets_venue_id_idx" ON "pos_tickets"("venue_id");
CREATE INDEX IF NOT EXISTS "pos_tickets_session_id_idx" ON "pos_tickets"("session_id");
CREATE INDEX IF NOT EXISTS "pos_tickets_status_idx" ON "pos_tickets"("venue_id", "status");
CREATE INDEX IF NOT EXISTS "pos_tickets_created_at_idx" ON "pos_tickets"("venue_id", "created_at");

-- ─── POS Ticket Items (line items) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_ticket_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "pos_tickets"("id") ON DELETE CASCADE,
  "menu_item_id" uuid REFERENCES "menu_items"("id"),
  "name" varchar(255) NOT NULL,
  "qty" integer NOT NULL DEFAULT 1,
  "unit_price_pence" integer NOT NULL,
  "modifier_pence" integer NOT NULL DEFAULT 0,
  "line_total_pence" integer NOT NULL,
  "notes" text,
  "voided" boolean DEFAULT false,
  "voided_by" uuid REFERENCES "users"("id"),
  "voided_at" timestamptz,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_ticket_items_ticket_id_idx" ON "pos_ticket_items"("ticket_id");

-- ─── POS Payments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "pos_tickets"("id") ON DELETE CASCADE,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "method" varchar(30) NOT NULL,
  "amount_pence" integer NOT NULL,
  "tip_pence" integer NOT NULL DEFAULT 0,
  "reference" varchar(255),
  "idempotency_key" varchar(100) UNIQUE,
  "status" varchar(20) NOT NULL DEFAULT 'completed',
  "processed_by" uuid REFERENCES "users"("id"),
  "processed_at" timestamptz DEFAULT now(),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_payments_ticket_id_idx" ON "pos_payments"("ticket_id");
CREATE INDEX IF NOT EXISTS "pos_payments_venue_id_idx" ON "pos_payments"("venue_id");
CREATE INDEX IF NOT EXISTS "pos_payments_processed_at_idx" ON "pos_payments"("venue_id", "processed_at");

-- ─── POS Refunds ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL REFERENCES "pos_payments"("id"),
  "ticket_id" uuid NOT NULL REFERENCES "pos_tickets"("id"),
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "amount_pence" integer NOT NULL,
  "reason" text NOT NULL,
  "processed_by" uuid NOT NULL REFERENCES "users"("id"),
  "processed_at" timestamptz DEFAULT now(),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_refunds_ticket_id_idx" ON "pos_refunds"("ticket_id");
CREATE INDEX IF NOT EXISTS "pos_refunds_venue_id_idx" ON "pos_refunds"("venue_id");
CREATE INDEX IF NOT EXISTS "pos_refunds_payment_id_idx" ON "pos_refunds"("payment_id");

-- ─── POS Audit Log (security trail) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL REFERENCES "venues"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id"),
  "action" varchar(50) NOT NULL,
  "entity_type" varchar(30) NOT NULL,
  "entity_id" uuid,
  "details" jsonb,
  "ip_address" varchar(45),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_audit_log_venue_id_idx" ON "pos_audit_log"("venue_id");
CREATE INDEX IF NOT EXISTS "pos_audit_log_created_at_idx" ON "pos_audit_log"("venue_id", "created_at");
CREATE INDEX IF NOT EXISTS "pos_audit_log_action_idx" ON "pos_audit_log"("venue_id", "action");
CREATE INDEX IF NOT EXISTS "pos_audit_log_entity_idx" ON "pos_audit_log"("entity_type", "entity_id");

-- ─── POS Config (per-venue settings) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "pos_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "venue_id" uuid NOT NULL UNIQUE REFERENCES "venues"("id") ON DELETE CASCADE,
  "tax_rate" decimal(5,2) NOT NULL DEFAULT 20.00,
  "service_charge_rate" decimal(5,2) NOT NULL DEFAULT 0,
  "service_charge_enabled" boolean DEFAULT false,
  "default_discount_pct" decimal(5,2) DEFAULT 0,
  "require_supervisor_for_refund" boolean DEFAULT true,
  "require_supervisor_for_void" boolean DEFAULT true,
  "require_supervisor_for_discount" boolean DEFAULT true,
  "auto_print_receipt" boolean DEFAULT false,
  "oversell_mode" varchar(10) DEFAULT 'warn',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "pos_config_venue_id_idx" ON "pos_config"("venue_id");

-- ─── Seed: default pos_config for every existing venue (UK 20% VAT) ─────────

DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN SELECT id FROM venues LOOP
    INSERT INTO pos_config (venue_id, tax_rate, service_charge_rate, service_charge_enabled)
    VALUES (v.id, 20.00, 0, false)
    ON CONFLICT ("venue_id") DO NOTHING;
  END LOOP;
END $$;
