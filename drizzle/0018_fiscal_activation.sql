-- Preserve all homologation history. No connector is enabled by this migration.
ALTER TABLE fiscal_documents DROP CONSTRAINT fiscal_documents_environment_check;
ALTER TABLE fiscal_documents ADD CONSTRAINT fiscal_documents_environment_check CHECK(environment IN ('homologation','production'));
ALTER TABLE fiscal_documents ADD COLUMN options jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE fiscal_documents ADD COLUMN issued_at timestamptz;
ALTER TABLE fiscal_documents ADD CONSTRAINT fiscal_documents_id_restaurant_environment_key UNIQUE(id,restaurant_id,environment);
ALTER TABLE fiscal_documents DROP CONSTRAINT fiscal_documents_restaurant_id_request_key_key;
ALTER TABLE fiscal_documents ADD CONSTRAINT fiscal_documents_request_environment_key UNIQUE(restaurant_id,environment,request_key);
ALTER TABLE fiscal_order_links ADD COLUMN environment text NOT NULL DEFAULT 'homologation' CHECK(environment IN ('homologation','production'));
ALTER TABLE fiscal_order_links DROP CONSTRAINT fiscal_order_links_pkey;
ALTER TABLE fiscal_order_links ADD PRIMARY KEY(restaurant_id,environment,order_id);
ALTER TABLE fiscal_order_links ADD CONSTRAINT fiscal_link_environment_fk FOREIGN KEY(document_id,restaurant_id,environment) REFERENCES fiscal_documents(id,restaurant_id,environment) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN checkout_group_id uuid;
CREATE INDEX fiscal_documents_period ON fiscal_documents(restaurant_id,environment,issued_at);
CREATE INDEX fiscal_events_period ON fiscal_events(restaurant_id,created_at,document_id);
