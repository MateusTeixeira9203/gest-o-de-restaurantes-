-- Internal bridge; no provider activation, jobs or external charges.
CREATE TABLE payment_intents (
 operation_id uuid PRIMARY KEY REFERENCES integration_operations(id) ON DELETE CASCADE,
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 table_id uuid NOT NULL REFERENCES dining_tables(id),
 cash_shift_id uuid NOT NULL REFERENCES cash_shifts(id),
 allocations jsonb NOT NULL CHECK(jsonb_typeof(allocations)='array'),
 state text NOT NULL DEFAULT 'awaiting' CHECK(state IN ('awaiting','applied','review')),
 reason text, applied_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_intents_restaurant ON payment_intents(restaurant_id,state,created_at);
CREATE TABLE payment_provider_receipts (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 provider text NOT NULL, external_id text NOT NULL,
 operation_id uuid NOT NULL UNIQUE REFERENCES payment_intents(operation_id) ON DELETE CASCADE,
 PRIMARY KEY(restaurant_id,provider,external_id)
);
