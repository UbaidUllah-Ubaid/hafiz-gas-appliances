import fs from 'node:fs/promises';
import path from 'node:path';

export async function runMigrations(pool, migrationsDir) {
  const files = (await fs.readdir(migrationsDir))
    .filter(file => /^\d+_.+\.sql$/.test(file))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
    )
  `);

  for (const file of files) {
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [file]
    );
    if (alreadyApplied.rowCount) {
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [64572180]);
      const appliedInTransaction = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1 FOR UPDATE',
        [file]
      );
      if (!appliedInTransaction.rowCount) {
        const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
