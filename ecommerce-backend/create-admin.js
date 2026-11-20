import 'dotenv/config';
import bcrypt from 'bcryptjs';
import db, { closeDb } from './db.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

try {
  const name = (
    process.env.ADMIN_NAME ||
    await rl.question('Admin name: ')
  ).trim();
  const email = (
    process.env.ADMIN_EMAIL ||
    'hafizgastandoors@gmail.com'
  ).trim().toLowerCase();
  const phone = (
    process.env.ADMIN_PHONE ||
    await rl.question('Admin phone (optional): ')
  ).trim();
  const password =
    process.env.ADMIN_PASSWORD ||
    await rl.question('Strong admin password (minimum 12 characters): ');

  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
    throw new Error(
      'Valid name/email and a password of at least 12 characters are required.'
    );
  }

  const existing = await db.query(
    'SELECT id, role FROM users WHERE email = $1',
    [email]
  );
  if (existing.rowCount) {
    throw new Error(
      existing.rows[0].role === 'admin'
        ? 'An admin account with this email already exists. No changes made.'
        : 'This email belongs to a customer account. Use a different email for admin.'
    );
  }

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    "INSERT INTO users (name, email, phone, password, role) VALUES ($1, $2, $3, $4, 'admin')",
    [name, email, phone, hash]
  );
  console.log(`Admin created successfully: ${email}`);
} catch (error) {
  console.error('Admin creation failed:', error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await closeDb();
}
