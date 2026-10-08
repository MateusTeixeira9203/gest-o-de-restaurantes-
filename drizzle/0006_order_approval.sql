-- Additive transition: legacy rows and their kitchen tickets remain unchanged.
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TABLE orders ALTER COLUMN queue_number DROP NOT NULL;
ALTER TABLE orders ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);
ALTER TABLE orders ADD COLUMN request_key text;
ALTER TABLE orders ADD COLUMN request_hash text;
ALTER TABLE orders ADD COLUMN approval_origin text NOT NULL DEFAULT 'legacy'
  CHECK (approval_origin IN ('legacy', 'pending', 'staff'));
ALTER TABLE orders ADD COLUMN approved_by_name text;
ALTER TABLE orders ADD COLUMN approved_by_role text;
ALTER TABLE orders ADD COLUMN approved_by_staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN cost_snapshot jsonb;
CREATE UNIQUE INDEX orders_request_key_idx ON orders(restaurant_id, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX orders_pending_approval_idx ON orders(restaurant_id, created_at) WHERE approval_origin = 'pending';
ALTER TABLE orders ADD CONSTRAINT orders_pending_has_no_production CHECK
  (approval_origin <> 'pending' OR (status::text IN ('pending','cancelled') AND queue_number IS NULL AND confirmed_at IS NULL));
ALTER TABLE orders ADD CONSTRAINT orders_staff_approval_has_actor CHECK
  (approval_origin <> 'staff' OR (confirmed_at IS NOT NULL AND approved_by_name IS NOT NULL AND approved_by_role IN ('admin','manager','waiter','cashier')));
