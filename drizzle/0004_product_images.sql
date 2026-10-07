-- Fotos otimizadas de produtos. Os bytes ficam fora da consulta do cardápio.
CREATE TABLE IF NOT EXISTS product_images (
  product_id uuid PRIMARY KEY REFERENCES menu_products(id) ON DELETE CASCADE,
  mime_type text NOT NULL CHECK (mime_type = 'image/webp'),
  image_data bytea NOT NULL CHECK (octet_length(image_data) BETWEEN 1 AND 600000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
