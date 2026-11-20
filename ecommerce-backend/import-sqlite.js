import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import db, { closeDb } from './db.js';

const sourcePath = path.resolve(
  process.env.SQLITE_DATABASE_PATH || './data/ecommerce.db'
);
const importKey = 'sqlite-source-v1';
const tableOrder = [
  'users',
  'products',
  'product_options',
  'reviews',
  'orders',
  'order_items',
  'contact_messages',
  'idempotency_keys',
  'password_reset_otps',
  'customer_carts'
];
const serialTables = [
  'users',
  'products',
  'product_options',
  'reviews',
  'orders',
  'order_items',
  'contact_messages',
  'password_reset_otps'
];

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unexpected SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function importSqlite(source) {
  const sourceTables = source.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map(row => row.name);
  const unknownTables = sourceTables.filter(name => !tableOrder.includes(name));
  if (unknownTables.length) {
    throw new Error(
      `SQLite contains tables not covered by this importer: ${unknownTables.join(', ')}`
    );
  }

  const presentTables = tableOrder.filter(name => sourceTables.includes(name));
  const sourceColumns = new Map(presentTables.map(table => [
    table,
    source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all()
      .map(column => column.name)
  ]));

  source.exec('BEGIN');
  const client = await db.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('SELECT pg_advisory_xact_lock($1)', [64572181]);

    const previousImport = await client.query(
      'SELECT row_counts FROM data_imports WHERE migration_key = $1',
      [importKey]
    );
    if (previousImport.rowCount) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      source.exec('COMMIT');
      console.log(
        `SQLite import already completed; no rows changed. Imported counts: ${previousImport.rows[0].row_counts}`
      );
      return;
    }

    for (const table of tableOrder) {
      const result = await client.query(`SELECT COUNT(*)::INTEGER AS count FROM "${table}"`);
      if (result.rows[0].count !== 0) {
        throw new Error(
          `PostgreSQL table ${table} is not empty. Import stopped without changes.`
        );
      }
    }

    const rowCounts = {};
    for (const table of presentTables) {
      const columns = sourceColumns.get(table);
      if (!columns.length) {
        rowCounts[table] = 0;
        continue;
      }

      const quotedColumns = columns.map(quoteIdentifier);
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const insert = `INSERT INTO "${table}" (${quotedColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;
      const statement = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`);
      let count = 0;

      for (const row of statement.iterate()) {
        await client.query(insert, columns.map(column => row[column]));
        count += 1;
      }
      rowCounts[table] = count;
    }

    for (const table of serialTables) {
      if (presentTables.includes(table)) {
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence($1, 'id'),
            COALESCE(MAX(id), 1),
            MAX(id) IS NOT NULL
          )
          FROM "${table}"
        `, [table]);
      }
    }

    await client.query(
      'INSERT INTO data_imports (migration_key, row_counts) VALUES ($1, $2)',
      [importKey, JSON.stringify(rowCounts)]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    source.exec('COMMIT');
    console.log(`SQLite import completed transactionally: ${JSON.stringify(rowCounts)}`);
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    try {
      source.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('Unable to end the read-only SQLite snapshot:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

let source;
try {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`SQLite source database not found: ${sourcePath}`);
  }
  source = new DatabaseSync(sourcePath, { readOnly: true });
  await importSqlite(source);
} catch (error) {
  console.error('SQLite data import failed:', error);
  process.exitCode = 1;
} finally {
  if (source) {
    source.close();
  }
  await closeDb();
}
