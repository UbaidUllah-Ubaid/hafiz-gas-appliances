import 'dotenv/config';
import bcrypt from 'bcryptjs';
import db from './db.js';
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

  const existing = db
    .prepare('SELECT id, role FROM users WHERE email = ?')
    .get(email);

  if (existing) {
    if (existing.role === 'admin') {
      throw new Error(
        'An admin account with this email already exists. No changes made.'
      );
    }

    throw new Error(
      'This email belongs to a customer account. Use a different email for admin.'
    );
  }

  const hash = await bcrypt.hash(password, 12);

  db.prepare(
    "INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'admin')"
  ).run(name, email, phone, hash);

  console.log(`Admin created successfully: ${email}`);
} catch (error) {
  console.error('Admin creation failed:', error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  db.close();
}
