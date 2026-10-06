-- Patos Lanches operational core. All amounts are stored in centavos.
CREATE TYPE order_source AS ENUM ('waiter', 'public_menu', 'qr_menu');
CREATE TYPE fulfillment_type AS ENUM ('dine_in', 'pickup', 'delivery');
CREATE TYPE order_status AS ENUM ('draft', 'confirmed', 'preparing', 'ready', 'collected', 'out_for_delivery', 'delivered', 'completed', 'cancelled');
CREATE TYPE kitchen_ticket_status AS ENUM ('new', 'preparing', 'ready', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded', 'cancelled');

CREATE TABLE restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  whatsapp text,
  service_rate_basis_points integer NOT NULL DEFAULT 1000 CHECK (service_rate_basis_points BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE restaurant_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  next_order_number bigint NOT NULL DEFAULT 1 CHECK (next_order_number > 0),
  next_queue_number bigint NOT NULL DEFAULT 1 CHECK (next_queue_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, number)
);

CREATE TABLE menu_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  kitchen_sector text NOT NULL,
  available boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE menu_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES menu_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE product_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES menu_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_number bigint NOT NULL,
  queue_number bigint NOT NULL,
  source order_source NOT NULL,
  fulfillment fulfillment_type NOT NULL,
  status order_status NOT NULL DEFAULT 'draft',
  table_id uuid REFERENCES dining_tables(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  notes text,
  estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  service_cents integer NOT NULL DEFAULT 0 CHECK (service_cents >= 0),
  delivery_fee_cents integer NOT NULL DEFAULT 0 CHECK (delivery_fee_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  confirmed_at timestamptz,
  ready_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, order_number),
  UNIQUE (restaurant_id, queue_number),
  CHECK ((fulfillment = 'dine_in' AND table_id IS NOT NULL) OR fulfillment <> 'dine_in')
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES menu_products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES menu_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_name text NOT NULL,
  kitchen_sector text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kitchen_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kitchen_sector text NOT NULL,
  queue_number bigint NOT NULL,
  status kitchen_ticket_status NOT NULL DEFAULT 'new',
  priority smallint NOT NULL DEFAULT 0,
  started_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kitchen_sector)
);

CREATE TABLE delivery_details (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  address_line1 text NOT NULL,
  address_line2 text,
  neighborhood text,
  city text,
  state text,
  postal_code text,
  reference text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  delivery_contact_name text,
  delivery_contact_phone text,
  courier_name text,
  assigned_at timestamptz,
  departed_at timestamptz,
  delivered_at timestamptz,
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL))
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('pix', 'cash', 'debit', 'credit', 'online')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status payment_status NOT NULL DEFAULT 'pending',
  external_reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_role text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_kitchen_queue_idx ON orders (restaurant_id, status, queue_number) WHERE status IN ('confirmed', 'preparing', 'ready');
CREATE INDEX orders_table_active_idx ON orders (table_id, status) WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX kitchen_tickets_queue_idx ON kitchen_tickets (restaurant_id, kitchen_sector, status, priority DESC, queue_number);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_events_order_idx ON order_events (order_id, created_at DESC);
CREATE INDEX delivery_details_courier_idx ON delivery_details (courier_name) WHERE delivered_at IS NULL;

INSERT INTO restaurants (slug, name)
VALUES ('patos-lanches', 'Patos Lanches')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now();

INSERT INTO restaurant_counters (restaurant_id)
SELECT id FROM restaurants WHERE slug = 'patos-lanches'
ON CONFLICT (restaurant_id) DO NOTHING;

INSERT INTO dining_tables (restaurant_id, number, label)
SELECT r.id, n, 'Mesa ' || lpad(n::text, 2, '0')
FROM restaurants r CROSS JOIN generate_series(1, 15) AS n
WHERE r.slug = 'patos-lanches'
ON CONFLICT (restaurant_id, number) DO NOTHING;
