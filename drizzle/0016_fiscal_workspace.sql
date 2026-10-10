CREATE TABLE fiscal_profiles (
 restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
 data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fiscal_product_profiles (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES menu_products(id) ON DELETE CASCADE,
 data jsonb NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,product_id)
);
CREATE TABLE fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 environment text NOT NULL DEFAULT 'homologation' CHECK(environment='homologation'),
 request_key uuid NOT NULL, order_ids uuid[] NOT NULL, snapshot jsonb NOT NULL,
 blockers jsonb NOT NULL, operation_id uuid REFERENCES integration_operations(id),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(restaurant_id,request_key), UNIQUE(id,restaurant_id)
);
CREATE TABLE fiscal_order_links (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 document_id uuid NOT NULL,
 PRIMARY KEY(restaurant_id,order_id),
 FOREIGN KEY(document_id,restaurant_id) REFERENCES fiscal_documents(id,restaurant_id) ON DELETE CASCADE
);
CREATE TABLE fiscal_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 document_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('xml','auxiliary','cancellation')),
 content bytea NOT NULL CHECK(octet_length(content)<=8388608), mime text NOT NULL, sha256 text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,kind),
 FOREIGN KEY(document_id,restaurant_id) REFERENCES fiscal_documents(id,restaurant_id) ON DELETE CASCADE
);
CREATE TABLE fiscal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
 document_id uuid, action text NOT NULL, actor text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(document_id,restaurant_id) REFERENCES fiscal_documents(id,restaurant_id) ON DELETE CASCADE
);
CREATE INDEX fiscal_documents_restaurant_created ON fiscal_documents(restaurant_id,created_at);
