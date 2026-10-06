-- Optional inventory control and technical recipes.
CREATE TYPE inventory_movement_type AS ENUM (
  'initial', 'purchase', 'sale_consumption', 'cancellation_return', 'loss', 'adjustment'
);

CREATE TABLE inventory_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Geral',
  unit text NOT NULL CHECK (unit IN ('un', 'g', 'kg', 'ml', 'L')),
  quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  minimum_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  average_cost_cents numeric(14,4) NOT NULL DEFAULT 0 CHECK (average_cost_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE product_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES menu_variants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variant_id, inventory_item_id)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  type inventory_movement_type NOT NULL,
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost_cents numeric(14,4),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_items_restaurant_idx ON inventory_items (restaurant_id, active, name);
CREATE INDEX product_recipe_components_variant_idx ON product_recipe_components (variant_id);
CREATE INDEX inventory_movements_item_created_idx ON inventory_movements (inventory_item_id, created_at DESC);

INSERT INTO inventory_settings (restaurant_id)
SELECT id FROM restaurants
ON CONFLICT (restaurant_id) DO NOTHING;
