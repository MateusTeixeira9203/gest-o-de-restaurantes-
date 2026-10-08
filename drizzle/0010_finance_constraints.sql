CREATE FUNCTION check_finance_header_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance numeric; line_count integer;
BEGIN
 IF EXISTS(SELECT 1 FROM finance_entries WHERE id=NEW.id) THEN
  SELECT COALESCE(sum(debit_cents-credit_cents),0),count(*) INTO balance,line_count FROM finance_lines WHERE entry_id=NEW.id;
  IF balance<>0 OR line_count<2 THEN RAISE EXCEPTION 'Lançamento financeiro desequilibrado ou sem contrapartida'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER finance_header_balanced AFTER INSERT OR UPDATE ON finance_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_finance_header_balance();
CREATE FUNCTION prevent_finance_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Lançamentos não podem ser editados. Registre um estorno e um novo lançamento.'; END $$;
CREATE TRIGGER finance_entries_no_rewrite BEFORE UPDATE ON finance_entries FOR EACH ROW EXECUTE FUNCTION prevent_finance_rewrite();
CREATE TRIGGER finance_lines_no_rewrite BEFORE UPDATE ON finance_lines FOR EACH ROW EXECUTE FUNCTION prevent_finance_rewrite();
ALTER TABLE finance_documents ADD CONSTRAINT finance_document_entry_tenant FOREIGN KEY(entry_id,restaurant_id) REFERENCES finance_entries(id,restaurant_id);
ALTER TABLE finance_settlements ADD CONSTRAINT finance_settlement_entry_tenant FOREIGN KEY(entry_id,restaurant_id) REFERENCES finance_entries(id,restaurant_id);
