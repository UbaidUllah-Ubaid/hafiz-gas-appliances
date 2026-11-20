import db, { closeDb } from './db.js';

try {
  const result = await db.query(
    'SELECT id, name, email, role FROM users ORDER BY id'
  );
  console.table(result.rows);
} catch (error) {
  console.error('Unable to read users:', error.message);
  process.exitCode = 1;
} finally {
  await closeDb();
}