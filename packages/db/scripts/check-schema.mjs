import dotenv from 'dotenv';
import pg from 'pg';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env'), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const cols = await client.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`
);
console.log('users columns:', cols.rows.map((x) => x.column_name).join(', '));

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
);
console.log('tables:', tables.rows.map((x) => x.table_name).join(', '));

try {
  const migs = await client.query('SELECT * FROM pgmigrations ORDER BY id');
  console.log('pgmigrations rows:', JSON.stringify(migs.rows, null, 2));
} catch {
  console.log('pgmigrations: (does not exist)');
}

client.release();
await pool.end();
