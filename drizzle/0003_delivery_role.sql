-- Motoboys usam o mesmo acesso rápido por PIN, com uma visão limitada a entregas.
ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_role_check;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_role_check CHECK (role IN ('manager', 'waiter', 'kitchen', 'cashier', 'delivery'));
