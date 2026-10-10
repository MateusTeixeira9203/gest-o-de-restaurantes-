-- Additive; does not enable payments or change existing restaurant records.
CREATE TABLE restaurant_payment_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  pix_enabled boolean NOT NULL DEFAULT false,
  pix_key text NOT NULL DEFAULT '',
  pix_name text NOT NULL DEFAULT '',
  pix_city text NOT NULL DEFAULT '',
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(pix_key) <= 77 AND length(pix_name) <= 25 AND length(pix_city) <= 15),
  CHECK (NOT pix_enabled OR (length(pix_key) > 0 AND length(pix_name) > 0 AND length(pix_city) > 0))
);
CREATE TABLE payment_settings_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  actor_name text NOT NULL,
  pix_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_settings_events_restaurant_date ON payment_settings_events(restaurant_id,created_at);
