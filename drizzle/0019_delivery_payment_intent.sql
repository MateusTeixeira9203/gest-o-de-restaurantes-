-- 0019 · pagamento previsto e troco na entrega; taxa de entrega padrão do restaurante (A3, GF-028)
ALTER TABLE delivery_details
  ADD COLUMN expected_payment_method text,
  ADD COLUMN cash_tendered_cents integer,
  ADD CONSTRAINT delivery_details_expected_payment_method_check
    CHECK (expected_payment_method IN ('pix', 'cash', 'debit', 'credit', 'prepaid')),
  ADD CONSTRAINT delivery_details_cash_tendered_cents_check
    CHECK (cash_tendered_cents >= 0),
  ADD CONSTRAINT delivery_details_tendered_only_cash
    CHECK (cash_tendered_cents IS NULL OR expected_payment_method IS NOT DISTINCT FROM 'cash');
ALTER TABLE restaurants
  ADD COLUMN default_delivery_fee_cents integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT restaurants_default_delivery_fee_cents_check
    CHECK (default_delivery_fee_cents >= 0);
