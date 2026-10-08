INSERT INTO finance_accounts(restaurant_id,code,name,kind)
SELECT id,'service_payable','Taxa de serviço a repassar','liability' FROM restaurants
ON CONFLICT(restaurant_id,code) DO NOTHING;
