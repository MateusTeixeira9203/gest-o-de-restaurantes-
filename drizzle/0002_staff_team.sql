-- Pessoas da equipe usam um PIN curto somente para iniciar o turno.
CREATE TABLE staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'waiter', 'kitchen', 'cashier')),
  pin_salt text NOT NULL,
  pin_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE INDEX staff_members_restaurant_active_idx ON staff_members (restaurant_id, active, name);
