ALTER TABLE inventory_items ADD COLUMN cost_known boolean NOT NULL DEFAULT false;
UPDATE inventory_items SET cost_known=true WHERE average_cost_cents>0;
ALTER TABLE menu_variants ADD COLUMN packaging_cost_cents integer NOT NULL DEFAULT 0 CHECK(packaging_cost_cents>=0);
ALTER TABLE menu_variants ADD COLUMN recipe_cost_complete boolean NOT NULL DEFAULT false;
ALTER TABLE product_addons ADD COLUMN cost_cents integer CHECK(cost_cents>=0);
