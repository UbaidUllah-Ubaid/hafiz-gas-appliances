
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const configuredPath = process.env.DATABASE_PATH || './data/ecommerce.db';
const dbPath = path.resolve(configuredPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL CHECK(price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    image_url TEXT,
    images TEXT NOT NULL DEFAULT '[]',
    category TEXT,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS product_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    option_group TEXT NOT NULL,
    option_value TEXT NOT NULL,
    extra_price REAL NOT NULL DEFAULT 0 CHECK(extra_price >= 0),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total_price REAL NOT NULL CHECK(total_price >= 0),
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','confirmed','processing','shipped','delivered','cancelled')),
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    shipping_address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
  )`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    selected_options TEXT NOT NULL DEFAULT '{}',
    product_title TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT
  )`,

  `CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
      CHECK(status IN ('new','read','replied','closed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS password_reset_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at INTEGER,
    reset_token_hash TEXT,
    reset_token_expires_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

for (const sql of tables) {
  db.exec(sql);
}

// Safe, additive migrations for older database versions.
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(columnInfo => columnInfo.name);

  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('products', 'image_url', 'TEXT');
ensureColumn('products', 'images', "TEXT NOT NULL DEFAULT '[]'");
ensureColumn('products', 'category', 'TEXT');
ensureColumn('products', 'is_published', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('products', 'updated_at', 'TEXT');

db.exec(`
  UPDATE products
  SET updated_at = datetime('now')
  WHERE updated_at IS NULL
`);

ensureColumn('orders', 'customer_name', 'TEXT');
ensureColumn('orders', 'customer_email', 'TEXT');
ensureColumn('orders', 'customer_phone', 'TEXT');
ensureColumn('orders', 'shipping_address', 'TEXT');
ensureColumn('orders', 'notes', 'TEXT');
ensureColumn('orders', 'updated_at', 'TEXT');

db.exec(`
  UPDATE orders
  SET updated_at = datetime('now')
  WHERE updated_at IS NULL
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_published
  ON products(is_published, id DESC);

  CREATE INDEX IF NOT EXISTS idx_products_category
  ON products(category);

  CREATE INDEX IF NOT EXISTS idx_orders_user
  ON orders(user_id, id DESC);

  CREATE INDEX IF NOT EXISTS idx_orders_status
  ON orders(status, id DESC);

  CREATE INDEX IF NOT EXISTS idx_reviews_product
  ON reviews(product_id, id DESC);

  CREATE INDEX IF NOT EXISTS idx_contact_status
  ON contact_messages(status, id DESC);

  CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user
  ON password_reset_otps(user_id);
`);

export default db;