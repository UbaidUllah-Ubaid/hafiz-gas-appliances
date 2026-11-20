import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { closeDb } from './db.js';
import { runMigrations } from './migrations/runner.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

try {
  await runMigrations(db, migrationsDir);
  console.log('PostgreSQL schema migrations completed.');
} catch (error) {
  console.error('PostgreSQL schema migration failed:', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
