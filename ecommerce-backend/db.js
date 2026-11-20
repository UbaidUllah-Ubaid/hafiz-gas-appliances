import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set to connect to PostgreSQL.');
}

const db = new Pool({ connectionString });

db.on('error', error => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export async function closeDb() {
  await db.end();
}

export default db;
