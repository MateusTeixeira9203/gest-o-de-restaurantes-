-- Login resolves names without case sensitivity; uniqueness must match that rule.
CREATE UNIQUE INDEX staff_members_identity_idx ON staff_members(restaurant_id,lower(name));
-- Preserve the original pilot's visual identity after adding configurable accents.
UPDATE restaurants SET accent_color='#ffbd18' WHERE slug='patos-lanches' AND accent_color='#059669';
