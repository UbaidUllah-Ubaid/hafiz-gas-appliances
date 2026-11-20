import 'dotenv/config';
import bcrypt from 'bcryptjs';
import db, { closeDb } from './db.js';

async function seed() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@store.com')
    .trim()
    .toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      'Set SEED_ADMIN_PASSWORD to a strong password of at least 12 characters before running npm run seed.'
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );
    if (!existing.rowCount) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await client.query(`
        INSERT INTO users (name, email, phone, password, role)
        VALUES ($1, $2, $3, $4, 'admin')
      `, [
        process.env.SEED_ADMIN_NAME || 'Store Admin',
        adminEmail,
        process.env.SEED_ADMIN_PHONE || '',
        hash
      ]);
      console.log(`Created admin account: ${adminEmail}`);
    } else {
      console.log(`Admin account already exists; left unchanged: ${adminEmail}`);
    }

    const products = await client.query('SELECT 1 FROM products LIMIT 1');
    if (products.rowCount) {
      console.log('Products already exist; demo products were not added.');
    } else {
      await client.query(`
        INSERT INTO products (title, sku, description, price, stock, category)
        VALUES
          ('Demo Gas Hob', 'DEMO-HOB-001', 'Replace this demonstration item with your real product data.', 18500, 10, 'Gas Appliances'),
          ('Demo Gas Water Heater', 'DEMO-GWH-001', 'Replace this demonstration item with your real product data.', 32000, 5, 'Water Heaters')
      `);
      console.log('Added two demo products. Edit or delete them from the admin panel.');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await seed();
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}
