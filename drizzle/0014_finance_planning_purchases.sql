CREATE TABLE finance_series (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('installments','recurring')), title text NOT NULL,
 occurrences integer NOT NULL CHECK(occurrences BETWEEN 1 AND 60), created_by text NOT NULL,
 stopped_at timestamptz, stop_reason text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,restaurant_id)
);
ALTER TABLE finance_documents ADD COLUMN series_id uuid REFERENCES finance_series(id);
ALTER TABLE finance_documents ADD COLUMN occurrence integer;
CREATE UNIQUE INDEX finance_document_occurrence ON finance_documents(series_id,occurrence) WHERE series_id IS NOT NULL;
CREATE TABLE purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 supplier text NOT NULL, reference text NOT NULL, purchased_on date NOT NULL,
 series_id uuid NOT NULL REFERENCES finance_series(id), total_cents bigint NOT NULL CHECK(total_cents>0),
 cancelled_at timestamptz, cancellation_reason text, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,restaurant_id),
 UNIQUE(restaurant_id,supplier,reference)
);
CREATE TABLE purchase_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 purchase_id uuid NOT NULL, inventory_item_id uuid NOT NULL REFERENCES inventory_items(id),
 input_quantity numeric(18,3) NOT NULL CHECK(input_quantity>0), input_unit text NOT NULL CHECK(input_unit IN('un','kg','g','L','ml')),
 base_quantity numeric(18,3) NOT NULL CHECK(base_quantity>0), base_unit text NOT NULL,
 received_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(received_quantity>=0 AND received_quantity<=base_quantity),
 total_cents bigint NOT NULL CHECK(total_cents>0),
 FOREIGN KEY(purchase_id,restaurant_id) REFERENCES purchases(id,restaurant_id) ON DELETE CASCADE
);
CREATE INDEX purchases_restaurant_date ON purchases(restaurant_id,purchased_on);
ALTER TABLE inventory_movements ADD COLUMN purchase_line_id uuid REFERENCES purchase_lines(id);
