ALTER TABLE restaurants ADD COLUMN plan text NOT NULL DEFAULT 'professional' CHECK(plan IN('essential','professional'));
ALTER TABLE restaurants ADD COLUMN accent_color text NOT NULL DEFAULT '#059669' CHECK(accent_color ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE restaurants ADD COLUMN product_status text NOT NULL DEFAULT 'pilot' CHECK(product_status IN('pilot','active','suspended'));
CREATE TABLE restaurant_domains (
 hostname text PRIMARY KEY CHECK(hostname=lower(hostname) AND hostname !~ '[:/]'), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO restaurant_domains(hostname,restaurant_id) SELECT 'gest-o-de-restaurantes-opal.vercel.app',id FROM restaurants WHERE slug='patos-lanches';
CREATE TABLE authentication_attempts (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE, identity_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0, window_started_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,identity_hash)
);
