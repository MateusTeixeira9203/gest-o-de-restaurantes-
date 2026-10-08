ALTER TABLE orders ADD COLUMN served_at timestamptz;
CREATE TABLE cash_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 opened_by text NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), opening_cents bigint NOT NULL CHECK(opening_cents>=0),
 closed_by text, closed_at timestamptz, counted_cents bigint CHECK(counted_cents>=0), expected_cents bigint, closing_note text,
 UNIQUE(id,restaurant_id), CHECK((closed_at IS NULL) = (counted_cents IS NULL))
);
CREATE UNIQUE INDEX cash_one_open_shift ON cash_shifts(restaurant_id) WHERE closed_at IS NULL;
CREATE TABLE finance_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id), code text NOT NULL, name text NOT NULL,
 kind text NOT NULL CHECK(kind IN('cash','bank','clearing','asset','liability','income','expense','equity')),
 UNIQUE(restaurant_id,code), UNIQUE(id,restaurant_id)
);
INSERT INTO finance_accounts(restaurant_id,code,name,kind)
SELECT r.id,v.code,v.name,v.kind FROM restaurants r CROSS JOIN (VALUES
 ('cash','Dinheiro no caixa','cash'),('bank','Banco / Pix','bank'),('cards','Cartões a receber','clearing'),
 ('receivable','Vendas a receber','asset'),('advances','Adiantamentos de clientes','liability'),('sales','Vendas realizadas','income'),
 ('payable','Fornecedores a pagar','liability'),('other_receivable','Outras contas a receber','asset'),('other_income','Outras receitas','income'),
 ('operating','Despesas operacionais','expense'),('tax','Tributos','expense'),('fees','Taxas de pagamento','expense'),
 ('stock','Compras de estoque','asset'),('capital','Investimentos','asset'),('equity','Saldo inicial / aporte','equity')
) v(code,name,kind);
CREATE TABLE finance_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 source_type text NOT NULL, source_id text NOT NULL, description text NOT NULL,
 effective_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), actor_name text NOT NULL,
 cash_shift_id uuid, reverses_id uuid UNIQUE REFERENCES finance_entries(id),
 UNIQUE(restaurant_id,source_type,source_id), UNIQUE(id,restaurant_id),
 FOREIGN KEY(cash_shift_id,restaurant_id) REFERENCES cash_shifts(id,restaurant_id)
);
CREATE TABLE finance_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 entry_id uuid NOT NULL, account_id uuid NOT NULL, debit_cents bigint NOT NULL DEFAULT 0 CHECK(debit_cents>=0), credit_cents bigint NOT NULL DEFAULT 0 CHECK(credit_cents>=0),
 CHECK((debit_cents>0 AND credit_cents=0) OR (credit_cents>0 AND debit_cents=0)),
 FOREIGN KEY(entry_id,restaurant_id) REFERENCES finance_entries(id,restaurant_id) ON DELETE CASCADE,
 FOREIGN KEY(account_id,restaurant_id) REFERENCES finance_accounts(id,restaurant_id)
);
CREATE INDEX finance_lines_account_idx ON finance_lines(restaurant_id,account_id);
CREATE INDEX finance_entries_period_idx ON finance_entries(restaurant_id,effective_date);
CREATE FUNCTION check_finance_entry_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_uuid uuid; balance numeric; line_count integer;
BEGIN
 entry_uuid := CASE WHEN TG_OP='DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
 IF EXISTS(SELECT 1 FROM finance_entries WHERE id=entry_uuid) THEN
   SELECT COALESCE(sum(debit_cents-credit_cents),0),count(*) INTO balance,line_count FROM finance_lines WHERE entry_id=entry_uuid;
   IF balance<>0 OR line_count<2 THEN RAISE EXCEPTION 'Lançamento financeiro desequilibrado'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_balanced AFTER INSERT OR UPDATE OR DELETE ON finance_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_finance_entry_balance();
CREATE TABLE finance_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id),
 kind text NOT NULL CHECK(kind IN('payable','receivable')), title text NOT NULL, contact text NOT NULL DEFAULT '',
 category text NOT NULL CHECK(category IN('operating','tax','stock','capital','other_income')),
 amount_cents bigint NOT NULL CHECK(amount_cents>0), competence_date date NOT NULL, due_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL, cancelled_at timestamptz, cancellation_reason text,
 entry_id uuid NOT NULL REFERENCES finance_entries(id), UNIQUE(id,restaurant_id)
);
CREATE INDEX finance_documents_due_idx ON finance_documents(restaurant_id,due_date) WHERE cancelled_at IS NULL;
CREATE TABLE finance_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants(id), document_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0), paid_on date NOT NULL, account_code text NOT NULL CHECK(account_code IN('cash','bank')),
 entry_id uuid NOT NULL REFERENCES finance_entries(id), reversed_at timestamptz, reversal_reason text,
 FOREIGN KEY(document_id,restaurant_id) REFERENCES finance_documents(id,restaurant_id)
);
CREATE TABLE finance_commands (
 restaurant_id uuid NOT NULL REFERENCES restaurants(id), request_key uuid NOT NULL, request_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(restaurant_id,request_key)
);
ALTER TABLE payments ADD COLUMN cash_shift_id uuid REFERENCES cash_shifts(id);
ALTER TABLE payments ADD COLUMN finance_entry_id uuid REFERENCES finance_entries(id);
ALTER TABLE payments ADD COLUMN reconciliation_entry_id uuid REFERENCES finance_entries(id);
ALTER TABLE payments ADD COLUMN received_cents bigint CHECK(received_cents>0);
ALTER TABLE payments ADD COLUMN change_cents bigint NOT NULL DEFAULT 0 CHECK(change_cents>=0);
