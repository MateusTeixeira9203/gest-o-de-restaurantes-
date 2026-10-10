-- Additive foundation only. No triggers or automatic external dispatch.
CREATE TABLE integration_operations (
 id uuid PRIMARY KEY,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('homologation','production')),
 kind text NOT NULL CHECK(kind IN ('fiscal','payment')),
 provider text NOT NULL,
 operation_key text NOT NULL,
 reference text NOT NULL UNIQUE,
 payload jsonb NOT NULL,
 payload_hash text NOT NULL,
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','dispatching','unknown','pending','succeeded','failed','cancelled')),
 result jsonb,
 lease_token uuid,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,environment,kind,operation_key)
);
CREATE INDEX integration_operations_pending ON integration_operations(restaurant_id,status,updated_at);
