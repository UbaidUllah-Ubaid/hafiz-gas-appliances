CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  category TEXT,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE product_options (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_group TEXT NOT NULL,
  option_value TEXT NOT NULL,
  extra_price DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (extra_price >= 0)
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total_price DOUBLE PRECISION NOT NULL CHECK (total_price >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  shipping_address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DOUBLE PRECISION NOT NULL CHECK (unit_price >= 0),
  selected_options TEXT NOT NULL DEFAULT '{}',
  product_title TEXT
);

CREATE TABLE contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'closed')),
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE password_reset_otps (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at BIGINT,
  reset_token_hash TEXT,
  reset_token_expires_at BIGINT,
  created_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE customer_carts (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE data_imports (
  migration_key TEXT PRIMARY KEY,
  imported_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
  row_counts TEXT NOT NULL
);

CREATE INDEX idx_products_published ON products(is_published, id DESC);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_orders_user ON orders(user_id, id DESC);
CREATE INDEX idx_orders_status ON orders(status, id DESC);
CREATE INDEX idx_reviews_product ON reviews(product_id, id DESC);
CREATE INDEX idx_contact_status ON contact_messages(status, id DESC);
CREATE INDEX idx_password_reset_otps_user ON password_reset_otps(user_id);
