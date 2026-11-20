import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = await fs.readFile(
  path.join(backendDir, 'migrations', '001_initial_schema.sql'),
  'utf8'
);

test('PostgreSQL migration declares every application table and index', () => {
  for (const table of [
    'users',
    'products',
    'product_options',
    'reviews',
    'orders',
    'order_items',
    'contact_messages',
    'idempotency_keys',
    'password_reset_otps',
    'customer_carts',
    'schema_migrations',
    'data_imports'
  ]) {
    assert.match(
      schema,
      new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${table}\\s*\\(`)
    );
  }

  for (const index of [
    'idx_products_published',
    'idx_products_category',
    'idx_orders_user',
    'idx_orders_status',
    'idx_reviews_product',
    'idx_contact_status',
    'idx_password_reset_otps_user'
  ]) {
    assert.match(schema, new RegExp(`CREATE INDEX ${index}\\b`));
  }
});

test('SQLite importer is read-only, transactional and protects against duplicate imports', async () => {
  const importer = await fs.readFile(
    path.join(backendDir, 'import-sqlite.js'),
    'utf8'
  );
  assert.match(importer, /new DatabaseSync\(sourcePath, \{ readOnly: true \}\)/);
  assert.match(importer, /await client\.query\('BEGIN'\)/);
  assert.match(importer, /await client\.query\('COMMIT'\)/);
  assert.match(importer, /await client\.query\('ROLLBACK'\)/);
  assert.match(importer, /FROM data_imports WHERE migration_key = \$1/);
  assert.match(importer, /pg_get_serial_sequence/);
  assert.match(importer, /'password_reset_otps'/);
  assert.match(importer, /'customer_carts'/);
});

test(
  'PostgreSQL migration constraints and defaults work',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      max: 1
    });
    const client = await pool.connect();
    const schemaName = `migration_test_${randomBytes(8).toString('hex')}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}"`);
      await client.query(schema);

      const user = await client.query(`
        INSERT INTO users (name, email, password)
        VALUES ('Test', 'test@example.com', 'existing-hash')
        RETURNING id, password
      `);
      assert.equal(user.rows[0].password, 'existing-hash');

      const product = await client.query(`
        INSERT INTO products (title, sku, description, price, stock)
        VALUES ('Test', 'TEST-001', 'Description', 1, 1)
        RETURNING id
      `);

      await assert.rejects(client.query(`
        INSERT INTO products (title, sku, description, price, stock)
        VALUES ('Invalid', 'TEST-NEGATIVE', 'Description', -1, 1)
      `));
      await assert.rejects(client.query(`
        INSERT INTO reviews (product_id, user_id, rating, comment)
        VALUES ($1, $2, 6, 'invalid')
      `, [product.rows[0].id, user.rows[0].id]));
      await assert.rejects(client.query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES (999, $1, 1, 1)
      `, [product.rows[0].id]));

      const contact = await client.query(`
        INSERT INTO contact_messages (name, email, subject, message)
        VALUES ('Test', 'test@example.com', 'Question', 'Hello')
        RETURNING status
      `);
      assert.equal(contact.rows[0].status, 'new');
    } finally {
      try {
        await client.query('RESET search_path');
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        client.release();
        await pool.end();
      }
    }
  }
);


test('review migration enforces one review per registered customer and product', async () => {
  const migration = await fs.readFile(
    path.join(backendDir, 'migrations', '002_review_uniqueness.sql'),
    'utf8'
  );
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_reviews_product_user\s+ON reviews\(product_id, user_id\)/i);
  const reviewRoute = await fs.readFile(path.join(backendDir, 'routes', 'reviews.js'), 'utf8');
  assert.match(reviewRoute, /authenticateToken/);
  assert.match(reviewRoute, /ON CONFLICT \(product_id, user_id\)/);
  assert.match(reviewRoute, /DO UPDATE SET rating = EXCLUDED\.rating/);
  assert.doesNotMatch(reviewRoute, /order_items|orders WHERE/);
});

test('product API exposes rating summary and only flags strong, sufficiently sampled ratings', async () => {
  const products = await fs.readFile(path.join(backendDir, 'routes', 'products.js'), 'utf8');
  assert.match(products, /average_rating: averageRating/);
  assert.match(products, /review_count: reviewCount/);
  assert.match(products, /averageRating >= 4 && reviewCount >= 3/);
});
