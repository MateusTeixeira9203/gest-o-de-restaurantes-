-- Optional restaurant logo and cover for the public delivery/table menu.
-- Existing orders, products, employees and settings remain untouched.
CREATE TABLE IF NOT EXISTS restaurant_brand_images (
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('logo', 'cover')),
  mime_type text NOT NULL CHECK (mime_type = 'image/webp'),
  image_data bytea NOT NULL CHECK (octet_length(image_data) BETWEEN 1 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, kind)
);
